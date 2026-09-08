'use server';

import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

type TxClient = Prisma.TransactionClient;

async function nextDyeingReference(tx: TxClient): Promise<string> {
  const count = await tx.dyeingBatch.count();
  return `DYE-${(count + 1).toString().padStart(6, '0')}`;
}

const shadeLineSchema = z.object({
  shadeNumber: z.string().optional(),
  quantity: z.coerce.number().int().positive(),
});

const warpSchema = z.object({
  shadeLines: z.array(shadeLineSchema).min(1, 'Add at least one shade'),
});

const sendForDyeingSchema = z.object({
  rawMaterialId: z.string().min(1, 'Raw material is required'),
  sentDate: z.string().min(1, 'Date is required'),
  remarks: z.string().optional(),
  warps: z.array(warpSchema).min(1, 'Add at least one warp'),
  // Dyeing billing (v2 gap #6) — all optional, the send/receive flow
  // works exactly the same with none of these set.
  partyId: z.string().optional(),
  charges: z.coerce.number().nonnegative().optional(),
  expectedReturnDate: z.string().optional(),
});

export type DyeingFormState = { error?: string; id?: string };

export async function sendForDyeing(input: unknown): Promise<DyeingFormState> {
  const user = await requirePermissionForAction('production');

  const parsed = sendForDyeingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  for (const [i, warp] of data.warps.entries()) {
    const total = warp.shadeLines.reduce((sum, s) => sum + s.quantity, 0);
    if (total !== 24) {
      return { error: `Warp ${i + 1}'s shade quantities add up to ${total}, not 24.` };
    }
  }

  try {
    const batch = await prisma.$transaction(async (tx) => {
      const rawMaterial = await tx.rawMaterial.findUniqueOrThrow({ where: { id: data.rawMaterialId } });
      if (rawMaterial.category !== 'WARP') {
        throw new Error(`${rawMaterial.name} is not a Warp-category raw material.`);
      }
      const warpCount = data.warps.length;
      // Stock isn't checked here — the physical warp may exist and be sent
      // for dyeing even if it hasn't been logged as a purchase yet, so
      // currentStock is allowed to go negative rather than blocking the send.

      const created = await tx.dyeingBatch.create({
        data: {
          reference: await nextDyeingReference(tx),
          rawMaterialId: data.rawMaterialId,
          warpCount,
          sentDate: new Date(data.sentDate),
          remarks: data.remarks || undefined,
          createdById: user.id,
          partyId: data.partyId || undefined,
          charges: data.charges,
          expectedReturnDate: data.expectedReturnDate ? new Date(data.expectedReturnDate) : undefined,
        },
      });

      for (const [i, warp] of data.warps.entries()) {
        await tx.dyeingBatchWarp.create({
          data: {
            dyeingBatchId: created.id,
            warpIndex: i + 1,
            shadeLines: {
              create: warp.shadeLines.map((s) => ({ shadeNumber: s.shadeNumber?.trim() ?? '', sentQuantity: s.quantity })),
            },
          },
        });
      }

      await tx.rawMaterial.update({
        where: { id: data.rawMaterialId },
        data: { currentStock: { decrement: warpCount } },
      });
      await tx.rawMaterialTransaction.create({
        data: {
          rawMaterialId: data.rawMaterialId,
          type: 'ISSUE_OUT',
          quantity: -warpCount,
          refType: 'DyeingBatch',
          refId: created.id,
        },
      });

      await writeAuditLog(tx, user.id, 'CREATE', 'DyeingBatch', created.id, undefined, created);
      return created;
    });

    revalidatePath('/production');
    revalidatePath('/stock');
    return { id: batch.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not send warp for dyeing.' };
  }
}

const receiveSchema = z.object({
  dyeingBatchWarpId: z.string().min(1),
  receivedDate: z.string().min(1, 'Received date is required'),
  remarks: z.string().optional(),
  shadeReceipts: z.array(z.object({
    shadeLineId: z.string().min(1),
    shadeNumber: z.string().optional(),
    receivedQuantity: z.coerce.number().int().nonnegative(),
  })),
});

export async function receiveDyedWarp(input: unknown): Promise<DyeingFormState> {
  const user = await requirePermissionForAction('production');

  const parsed = receiveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const warp = await tx.dyeingBatchWarp.findUniqueOrThrow({
        where: { id: data.dyeingBatchWarpId },
        include: { shadeLines: true },
      });
      if (warp.receivedAt) throw new Error('This warp has already been received.');

      for (const receipt of data.shadeReceipts) {
        const line = warp.shadeLines.find((l) => l.id === receipt.shadeLineId);
        if (!line) throw new Error('Shade line does not belong to this warp.');

        // Shade number is optional at send time (the dyeing house often
        // hasn't decided it yet) but needed here — once received, this warp
        // becomes assignable-by-shade-composition on /production and
        // /warp-alerts, so every non-zero line needs a real shade name.
        const shadeNumber = receipt.shadeNumber?.trim() || line.shadeNumber;
        if (receipt.receivedQuantity > 0 && !shadeNumber) {
          throw new Error('Enter a shade number before receiving this line.');
        }

        await tx.dyeingShadeLine.update({
          where: { id: receipt.shadeLineId },
          data: { receivedQuantity: receipt.receivedQuantity, shadeNumber },
        });
      }

      const updatedWarp = await tx.dyeingBatchWarp.update({
        where: { id: data.dyeingBatchWarpId },
        data: { receivedAt: new Date(data.receivedDate), receivedRemarks: data.remarks || undefined },
      });

      const allWarps = await tx.dyeingBatchWarp.findMany({ where: { dyeingBatchId: warp.dyeingBatchId } });
      const receivedCount = allWarps.filter((w) => w.receivedAt || w.id === data.dyeingBatchWarpId).length;
      const status = receivedCount === allWarps.length ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
      const updatedBatch = await tx.dyeingBatch.update({ where: { id: warp.dyeingBatchId }, data: { status } });

      await writeAuditLog(tx, user.id, 'UPDATE', 'DyeingBatchWarp', updatedWarp.id, warp, updatedWarp);
      return updatedBatch;
    });

    revalidatePath('/production');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not receive dyed warp.' };
  }
}

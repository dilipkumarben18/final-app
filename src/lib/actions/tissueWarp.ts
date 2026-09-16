'use server';

import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

type TxClient = Prisma.TransactionClient;

export type TissueWarpFormState = { error?: string; id?: string };

async function nextDyeingReference(tx: TxClient): Promise<string> {
  const count = await tx.dyeingBatch.count();
  return `DYE-${(count + 1).toString().padStart(6, '0')}`;
}

async function nextPateReference(tx: TxClient): Promise<string> {
  const count = await tx.pateRoll.count();
  return `PATE-${(count + 1).toString().padStart(6, '0')}`;
}

const tissueWarpSchema = z.object({
  rawMaterialId: z.string().min(1, 'Jari Marcs material is required'),
  weightUsedKg: z.coerce.number().positive('Weight must be greater than 0'),
  sareeCapacity: z.coerce.number().int().min(1).max(60, 'That capacity looks too high — check the number'),
  remarks: z.string().optional(),
});

// Tissue warps skip the whole Silk send/dye/receive round trip — the
// roller is ready as soon as marcs are given to it, so this creates the
// DyeingBatch + DyeingBatchWarp already RECEIVED, with no shade lines
// (per the "simple weight/quantity, no shade tracking" decision). It
// slots straight into the same assign-to-weaver pipeline as Silk warps —
// Warp Alerts' "available warps" list picks it up automatically.
export async function createTissueWarp(input: unknown): Promise<TissueWarpFormState> {
  const user = await requirePermissionForAction('production');
  const parsed = tissueWarpSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const warp = await prisma.$transaction(async (tx) => {
      const material = await tx.rawMaterial.findUniqueOrThrow({ where: { id: data.rawMaterialId } });
      if (material.category !== 'JARI') throw new Error(`${material.name} is not a Jari-category raw material.`);

      const batch = await tx.dyeingBatch.create({
        data: {
          reference: await nextDyeingReference(tx),
          rawMaterialId: data.rawMaterialId,
          warpCount: 1,
          status: 'RECEIVED',
          remarks: data.remarks || undefined,
          createdById: user.id,
        },
      });

      const created = await tx.dyeingBatchWarp.create({
        data: {
          dyeingBatchId: batch.id,
          warpIndex: 1,
          capacity: data.sareeCapacity,
          receivedAt: new Date(),
        },
      });

      await tx.rawMaterial.update({
        where: { id: data.rawMaterialId },
        data: { currentStock: { decrement: data.weightUsedKg } },
      });
      await tx.rawMaterialTransaction.create({
        data: {
          rawMaterialId: data.rawMaterialId,
          type: 'ISSUE_OUT',
          quantity: -data.weightUsedKg,
          refType: 'TissueWarp',
          refId: created.id,
        },
      });

      await writeAuditLog(tx, user.id, 'CREATE', 'DyeingBatchWarp', created.id, undefined, created);
      return created;
    });

    revalidatePath('/tissue-warp');
    revalidatePath('/warp-alerts');
    revalidatePath('/production');
    return { id: warp.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not create the Tissue Warp.' };
  }
}

const pateSchema = z.object({
  rawMaterialId: z.string().min(1, 'Jari Marcs material is required'),
  weightUsedKg: z.coerce.number().positive('Weight must be greater than 0'),
  remarks: z.string().optional(),
});

// Pate is its own product — not a warp, not tied to a saree or weaver.
// Just a log of marcs consumed to roll one, mirroring WeftDyeingBatch's
// single-purpose simplicity.
export async function createPateRoll(input: unknown): Promise<TissueWarpFormState> {
  const user = await requirePermissionForAction('production');
  const parsed = pateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const pate = await prisma.$transaction(async (tx) => {
      const material = await tx.rawMaterial.findUniqueOrThrow({ where: { id: data.rawMaterialId } });
      if (material.category !== 'JARI') throw new Error(`${material.name} is not a Jari-category raw material.`);

      const created = await tx.pateRoll.create({
        data: {
          reference: await nextPateReference(tx),
          rawMaterialId: data.rawMaterialId,
          weightUsedKg: data.weightUsedKg,
          remarks: data.remarks || undefined,
          createdById: user.id,
        },
      });

      await tx.rawMaterial.update({
        where: { id: data.rawMaterialId },
        data: { currentStock: { decrement: data.weightUsedKg } },
      });
      await tx.rawMaterialTransaction.create({
        data: {
          rawMaterialId: data.rawMaterialId,
          type: 'ISSUE_OUT',
          quantity: -data.weightUsedKg,
          refType: 'PateRoll',
          refId: created.id,
        },
      });

      await writeAuditLog(tx, user.id, 'CREATE', 'PateRoll', created.id, undefined, created);
      return created;
    });

    revalidatePath('/tissue-warp');
    return { id: pate.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not record the Pate roll.' };
  }
}

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

export type WeftDyeingFormState = { error?: string; id?: string };

const sendSchema = z.object({
  colourName: z.string().min(1, 'Colour is required'),
  sentWeightKg: z.coerce.number().positive('Weight must be greater than 0'),
});

// Deliberately simple, unlike warp dyeing (DyeingBatch): no source raw
// material is decremented here — weft dyeing is tracked as its own
// send/receive log, and the payoff is on the receiving side, where the
// dyed weight becomes usable stock for Material Issue.
export async function sendWeftForDyeing(input: unknown): Promise<WeftDyeingFormState> {
  const user = await requirePermissionForAction('production');
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const batch = await prisma.weftDyeingBatch.create({
      data: {
        colourName: data.colourName.trim(),
        sentWeightKg: data.sentWeightKg,
        sentById: user.id,
      },
    });
    await writeAuditLog(prisma, user.id, 'CREATE', 'WeftDyeingBatch', batch.id, undefined, batch);
    revalidatePath('/weft-dyeing');
    return { id: batch.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not send for dyeing.' };
  }
}

const receiveSchema = z.object({
  id: z.string().min(1),
  receivedWeightKg: z.coerce.number().positive('Weight must be greater than 0'),
});

export async function receiveDyedWeft(input: unknown): Promise<WeftDyeingFormState> {
  const user = await requirePermissionForAction('production');
  const parsed = receiveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.weftDyeingBatch.findUniqueOrThrow({ where: { id: data.id } });
      if (existing.status === 'RECEIVED') throw new Error('This batch has already been received.');

      const batch = await tx.weftDyeingBatch.update({
        where: { id: data.id },
        data: {
          receivedWeightKg: data.receivedWeightKg,
          receivedDate: new Date(),
          status: 'RECEIVED',
          receivedById: user.id,
        },
      });

      // Find-or-create the colour's WEFT raw material and add the dyed
      // weight to its stock — same colour-matching convention Material
      // Issue uses (case-insensitive name match).
      const material = await tx.rawMaterial.findFirst({
        where: { name: { equals: existing.colourName, mode: 'insensitive' }, category: 'WEFT' },
      });
      const resolved =
        material ??
        (await tx.rawMaterial.create({
          data: { name: existing.colourName, category: 'WEFT', unit: 'Kg' },
        }));

      await tx.rawMaterial.update({
        where: { id: resolved.id },
        data: { currentStock: { increment: data.receivedWeightKg } },
      });
      await tx.rawMaterialTransaction.create({
        data: {
          rawMaterialId: resolved.id,
          type: 'ADJUSTMENT',
          quantity: data.receivedWeightKg,
          refType: 'WeftDyeingBatch',
          refId: batch.id,
        },
      });

      await writeAuditLog(tx, user.id, 'UPDATE', 'WeftDyeingBatch', batch.id, existing, batch);
      return batch;
    });

    revalidatePath('/weft-dyeing');
    return { id: updated.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not receive.' };
  }
}

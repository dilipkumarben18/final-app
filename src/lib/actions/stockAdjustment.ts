'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMasterForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

export type StockAdjustmentFormState = { error?: string };

const directionSchema = z.enum(['ADD', 'SUBTRACT']);

const rawMaterialSchema = z.object({
  rawMaterialId: z.string().min(1, 'Raw material is required'),
  direction: directionSchema,
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  notes: z.string().optional(),
});

// Free-form stock correction with no Purchase/Sale behind it and no reason
// required — for opening stock, count corrections, or anything else that
// doesn't fit the normal transactional flows. Logged as an ADJUSTMENT
// transaction, same type any other non-purchase stock correction uses.
// Matches the rest of the production chain in not blocking on the result
// going negative.
export async function adjustRawMaterialStock(input: unknown): Promise<StockAdjustmentFormState> {
  const user = await requireMasterForAction();
  const parsed = rawMaterialSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;
  const signedQuantity = data.direction === 'ADD' ? data.quantity : -data.quantity;

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.rawMaterial.findUniqueOrThrow({ where: { id: data.rawMaterialId } });
      const after = await tx.rawMaterial.update({
        where: { id: data.rawMaterialId },
        data: { currentStock: { increment: signedQuantity } },
      });
      await tx.rawMaterialTransaction.create({
        data: {
          rawMaterialId: data.rawMaterialId,
          type: 'ADJUSTMENT',
          quantity: signedQuantity,
          refType: 'ManualAdjustment',
          notes: data.notes || undefined,
        },
      });
      await writeAuditLog(tx, user.id, 'UPDATE', 'RawMaterial', after.id, before, after);
    });

    revalidatePath('/stock');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not adjust stock.' };
  }
}

const finishedStockSchema = z.object({
  locationId: z.string().min(1, 'Location is required'),
  sareeTypeId: z.string().min(1, 'Saree type is required'),
  direction: directionSchema,
  quantity: z.coerce.number().int().positive('Quantity must be greater than 0'),
});

// Same idea for finished saree stock (Normal state) at a godown/home
// location — no Sale, Purchase, Collection, or Transfer record behind it.
export async function adjustFinishedStock(input: unknown): Promise<StockAdjustmentFormState> {
  const user = await requireMasterForAction();
  const parsed = finishedStockSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;
  const signedQuantity = data.direction === 'ADD' ? data.quantity : -data.quantity;

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.finishedStockBalance.upsert({
        where: {
          locationId_sareeTypeId_state: { locationId: data.locationId, sareeTypeId: data.sareeTypeId, state: 'NORMAL' },
        },
        create: { locationId: data.locationId, sareeTypeId: data.sareeTypeId, state: 'NORMAL', quantity: signedQuantity },
        update: { quantity: { increment: signedQuantity } },
      });
      await writeAuditLog(tx, user.id, 'UPDATE', 'FinishedStockBalance', updated.id, undefined, updated);
    });

    revalidatePath('/stock');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not adjust stock.' };
  }
}

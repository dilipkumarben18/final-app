'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

const transferSchema = z.object({
  fromLocationId: z.string().min(1, 'Source godown is required'),
  toLocationId: z.string().min(1, 'Destination home stock is required'),
  sareeTypeId: z.string().min(1, 'Saree type is required'),
  quantity: z.coerce.number().int().positive('Quantity must be greater than 0'),
  notes: z.string().optional(),
});

export type TransferFormState = { error?: string; id?: string };

export async function createTransfer(input: unknown): Promise<TransferFormState> {
  const user = await requirePermissionForAction('godownToHomeTransfer');

  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  if (data.fromLocationId === data.toLocationId) {
    return { error: 'Source and destination must be different.' };
  }

  try {
    const transfer = await prisma.$transaction(async (tx) => {
      const [fromLocation, toLocation] = await Promise.all([
        tx.stockLocation.findUniqueOrThrow({ where: { id: data.fromLocationId } }),
        tx.stockLocation.findUniqueOrThrow({ where: { id: data.toLocationId } }),
      ]);

      if (fromLocation.kind !== 'GODOWN') throw new Error('Source must be a Godown location.');
      if (toLocation.kind !== 'HOME') throw new Error('Destination must be a Home location.');

      const fromBalance = await tx.finishedStockBalance.findUnique({
        where: {
          locationId_sareeTypeId_state: {
            locationId: data.fromLocationId,
            sareeTypeId: data.sareeTypeId,
            state: 'NORMAL',
          },
        },
      });

      if (!fromBalance || fromBalance.quantity < data.quantity) {
        throw new Error('Not enough stock at the source godown for this transfer.');
      }

      await tx.finishedStockBalance.update({
        where: { id: fromBalance.id },
        data: { quantity: { decrement: data.quantity } },
      });

      await tx.finishedStockBalance.upsert({
        where: {
          locationId_sareeTypeId_state: {
            locationId: data.toLocationId,
            sareeTypeId: data.sareeTypeId,
            state: 'NORMAL',
          },
        },
        create: {
          locationId: data.toLocationId,
          sareeTypeId: data.sareeTypeId,
          state: 'NORMAL',
          quantity: data.quantity,
        },
        update: { quantity: { increment: data.quantity } },
      });

      const created = await tx.stockTransfer.create({
        data: {
          fromLocationId: data.fromLocationId,
          toLocationId: data.toLocationId,
          sareeTypeId: data.sareeTypeId,
          quantity: data.quantity,
          notes: data.notes || undefined,
        },
      });

      await writeAuditLog(tx, user.id, 'TRANSFER', 'StockTransfer', created.id, undefined, created);
      return created;
    });

    revalidatePath('/stock');
    return { id: transfer.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not complete transfer.' };
  }
}

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

export type JariLotFormState = { error?: string; id?: string };

const assignSchema = z
  .object({
    lotId: z.string().min(1),
    materialId: z.string().optional(),
    newBrandName: z.string().optional(),
  })
  .refine((d) => !!d.materialId || !!d.newBrandName?.trim(), {
    message: 'Pick an existing brand or type a new one',
    path: ['newBrandName'],
  });

// Names a brand for a box of Jari whose brand wasn't known at purchase time
// (see createPurchase in purchases.ts) and, only now, moves its quantity
// into that brand's RawMaterial stock — mirrors the normal Purchase stock
// effect (currentStock increment + a PURCHASE_IN RawMaterialTransaction),
// just deferred until the box has actually been checked.
export async function assignJariBrand(input: unknown): Promise<JariLotFormState> {
  const user = await requirePermissionForAction('jariLots');

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const lot = await prisma.$transaction(async (tx) => {
      const existingLot = await tx.jariLot.findUniqueOrThrow({ where: { id: data.lotId } });
      if (existingLot.status === 'ASSIGNED') throw new Error('This box has already been assigned a brand.');

      let material;
      if (data.materialId) {
        material = await tx.rawMaterial.findUniqueOrThrow({ where: { id: data.materialId } });
        if (material.category !== 'JARI') throw new Error('Selected material is not a Jari-category raw material.');
      } else {
        const name = data.newBrandName!.trim();
        material = await tx.rawMaterial.findFirst({
          where: { category: 'JARI', name: { equals: name, mode: 'insensitive' } },
        });
        if (!material) {
          material = await tx.rawMaterial.create({ data: { name, category: 'JARI', unit: existingLot.unit } });
        }
      }

      await tx.rawMaterial.update({
        where: { id: material.id },
        data: { currentStock: { increment: existingLot.quantity } },
      });
      await tx.rawMaterialTransaction.create({
        data: {
          rawMaterialId: material.id,
          type: 'PURCHASE_IN',
          quantity: existingLot.quantity,
          refType: 'JariLot',
          refId: existingLot.id,
        },
      });

      const updated = await tx.jariLot.update({
        where: { id: existingLot.id },
        data: {
          status: 'ASSIGNED',
          assignedMaterialId: material.id,
          assignedAt: new Date(),
          assignedById: user.id,
        },
      });

      await writeAuditLog(tx, user.id, 'UPDATE', 'JariLot', updated.id, existingLot, updated);
      return updated;
    });

    revalidatePath('/jari-lots');
    revalidatePath('/stock');
    revalidatePath('/settings/raw-materials');
    return { id: lot.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not assign brand.' };
  }
}

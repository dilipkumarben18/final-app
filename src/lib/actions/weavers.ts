'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMasterForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

const weaverSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  mobile: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  assignedLocationId: z.string().min(1, 'Assigned godown/factory is required'),
  sareeTypeIds: z.array(z.string()).default([]),
});

export type WeaverFormState = { error?: string; id?: string };

// Weavers are master data, not user accounts — no login/passcode.
export async function createWeaver(input: unknown): Promise<WeaverFormState> {
  const user = await requireMasterForAction();
  const parsed = weaverSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const weaver = await tx.weaverProfile.create({
        data: {
          name: data.name,
          mobile: data.mobile || undefined,
          address: data.address || undefined,
          notes: data.notes || undefined,
          assignedLocationId: data.assignedLocationId,
          sareeTypes: {
            create: data.sareeTypeIds.map((sareeTypeId) => ({ sareeTypeId })),
          },
        },
      });
      await writeAuditLog(tx, user.id, 'CREATE', 'WeaverProfile', weaver.id, undefined, weaver);
      return weaver;
    });

    revalidatePath('/settings/weavers');
    return { id: created.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save weaver. Please try again.' };
  }
}

export async function updateWeaver(id: string, input: unknown): Promise<WeaverFormState> {
  const user = await requireMasterForAction();
  const parsed = weaverSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.weaverProfile.findUniqueOrThrow({ where: { id } });
      const after = await tx.weaverProfile.update({
        where: { id },
        data: {
          name: data.name,
          mobile: data.mobile || null,
          address: data.address || null,
          notes: data.notes || null,
          assignedLocationId: data.assignedLocationId,
        },
      });
      await tx.weaverSareeType.deleteMany({ where: { weaverId: id } });
      if (data.sareeTypeIds.length > 0) {
        await tx.weaverSareeType.createMany({
          data: data.sareeTypeIds.map((sareeTypeId) => ({ weaverId: id, sareeTypeId })),
        });
      }
      await writeAuditLog(tx, user.id, 'UPDATE', 'WeaverProfile', id, before, after);
    });

    revalidatePath('/settings/weavers');
    return { id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save weaver. Please try again.' };
  }
}

export async function setWeaverActive(weaverId: string, isActive: boolean): Promise<WeaverFormState> {
  const user = await requireMasterForAction();

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.weaverProfile.findUniqueOrThrow({ where: { id: weaverId } });
      const after = await tx.weaverProfile.update({ where: { id: weaverId }, data: { isActive } });
      await writeAuditLog(tx, user.id, 'UPDATE', 'WeaverProfile', weaverId, before, after);
    });
    revalidatePath('/settings/weavers');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update weaver. Please try again.' };
  }
}

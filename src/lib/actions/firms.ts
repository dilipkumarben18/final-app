'use server';

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMasterForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

const firmSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  gstNumber: z.string().optional(),
  address: z.string().optional(),
  contactInfo: z.string().optional(),
});

export type FirmFormState = { error?: string; id?: string };

export async function createFirm(input: unknown): Promise<FirmFormState> {
  const user = await requireMasterForAction();
  const parsed = firmSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const created = await prisma.$transaction(async (tx) => {
      const firm = await tx.firm.create({ data: parsed.data });
      await writeAuditLog(tx, user.id, 'CREATE', 'Firm', firm.id, undefined, firm);
      return firm;
    });
    revalidatePath('/settings/firms');
    return { id: created.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'A firm with this name already exists.' };
    }
    return { error: e instanceof Error ? e.message : 'Could not save firm. Please try again.' };
  }
}

export async function updateFirm(id: string, input: unknown): Promise<FirmFormState> {
  const user = await requireMasterForAction();
  const parsed = firmSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.firm.findUniqueOrThrow({ where: { id } });
      const after = await tx.firm.update({ where: { id }, data: parsed.data });
      await writeAuditLog(tx, user.id, 'UPDATE', 'Firm', id, before, after);
    });
    revalidatePath('/settings/firms');
    return { id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'A firm with this name already exists.' };
    }
    return { error: e instanceof Error ? e.message : 'Could not save firm. Please try again.' };
  }
}

export async function setFirmActive(id: string, isActive: boolean): Promise<FirmFormState> {
  const user = await requireMasterForAction();

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.firm.findUniqueOrThrow({ where: { id } });
      const after = await tx.firm.update({ where: { id }, data: { isActive } });
      await writeAuditLog(tx, user.id, 'UPDATE', 'Firm', id, before, after);
    });
    revalidatePath('/settings/firms');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update firm. Please try again.' };
  }
}

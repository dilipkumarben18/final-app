'use server';

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMasterForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

const locationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  kind: z.enum(['GODOWN', 'HOME']),
  address: z.string().optional(),
});

export type LocationFormState = { error?: string; id?: string };

export async function createLocation(input: unknown): Promise<LocationFormState> {
  const user = await requireMasterForAction();
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const created = await prisma.$transaction(async (tx) => {
      const location = await tx.stockLocation.create({ data: parsed.data });
      await writeAuditLog(tx, user.id, 'CREATE', 'StockLocation', location.id, undefined, location);
      return location;
    });
    revalidatePath('/settings/locations');
    return { id: created.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'A location with this name already exists.' };
    }
    return { error: e instanceof Error ? e.message : 'Could not save location. Please try again.' };
  }
}

export async function updateLocation(id: string, input: unknown): Promise<LocationFormState> {
  const user = await requireMasterForAction();
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.stockLocation.findUniqueOrThrow({ where: { id } });
      const after = await tx.stockLocation.update({ where: { id }, data: parsed.data });
      await writeAuditLog(tx, user.id, 'UPDATE', 'StockLocation', id, before, after);
    });
    revalidatePath('/settings/locations');
    return { id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'A location with this name already exists.' };
    }
    return { error: e instanceof Error ? e.message : 'Could not save location. Please try again.' };
  }
}

export async function setLocationActive(id: string, isActive: boolean): Promise<LocationFormState> {
  const user = await requireMasterForAction();

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.stockLocation.findUniqueOrThrow({ where: { id } });
      const after = await tx.stockLocation.update({ where: { id }, data: { isActive } });
      await writeAuditLog(tx, user.id, 'UPDATE', 'StockLocation', id, before, after);
    });
    revalidatePath('/settings/locations');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update location. Please try again.' };
  }
}

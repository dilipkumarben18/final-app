'use server';

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMasterForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

const sareeTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  alternateNames: z.array(z.string()).default([]),
  itemGroup: z.enum(['SAREE', 'DHOTI', 'WASTE', 'OTHER']).default('SAREE'),
  hsnCode: z.string().optional(),
  jariPerSaree: z.coerce.number().nonnegative('Jari per saree must be 0 or more'),
  weftGramsPerSaree: z.coerce.number().nonnegative('Weft grams per saree must be 0 or more'),
  costPrice: z.coerce.number().nonnegative('Cost price must be 0 or more').optional(),
});

export type SareeTypeFormState = { error?: string; id?: string };

export async function createSareeType(input: unknown): Promise<SareeTypeFormState> {
  const user = await requireMasterForAction();
  const parsed = sareeTypeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const created = await prisma.$transaction(async (tx) => {
      const sareeType = await tx.sareeType.create({ data: parsed.data });
      await writeAuditLog(tx, user.id, 'CREATE', 'SareeType', sareeType.id, undefined, sareeType);
      return sareeType;
    });
    revalidatePath('/settings/saree-types');
    return { id: created.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'A saree type with this name already exists.' };
    }
    return { error: e instanceof Error ? e.message : 'Could not save saree type. Please try again.' };
  }
}

export async function updateSareeType(id: string, input: unknown): Promise<SareeTypeFormState> {
  const user = await requireMasterForAction();
  const parsed = sareeTypeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.sareeType.findUniqueOrThrow({ where: { id } });
      const after = await tx.sareeType.update({ where: { id }, data: parsed.data });
      await writeAuditLog(tx, user.id, 'UPDATE', 'SareeType', id, before, after);
    });
    revalidatePath('/settings/saree-types');
    return { id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'A saree type with this name already exists.' };
    }
    return { error: e instanceof Error ? e.message : 'Could not save saree type. Please try again.' };
  }
}

export async function setSareeTypeActive(id: string, isActive: boolean): Promise<SareeTypeFormState> {
  const user = await requireMasterForAction();

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.sareeType.findUniqueOrThrow({ where: { id } });
      const after = await tx.sareeType.update({ where: { id }, data: { isActive } });
      await writeAuditLog(tx, user.id, 'UPDATE', 'SareeType', id, before, after);
    });
    revalidatePath('/settings/saree-types');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update saree type. Please try again.' };
  }
}

'use server';

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMasterForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

export type CodeNameFormState = { error?: string; id?: string };

const codeNameSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
});

// Saree Colour master (v2 gap #10) — same shape and CRUD pattern as Jari
// Code below; kept as two small models rather than one generic "master
// type" table since they're used in genuinely different pickers.
export async function createSareeColour(input: unknown): Promise<CodeNameFormState> {
  const user = await requireMasterForAction();
  const parsed = codeNameSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.sareeColourMaster.create({ data: parsed.data });
      await writeAuditLog(tx, user.id, 'CREATE', 'SareeColourMaster', row.id, undefined, row);
      return row;
    });
    revalidatePath('/settings/colours');
    return { id: created.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'That code already exists.' };
    }
    return { error: e instanceof Error ? e.message : 'Could not save colour.' };
  }
}

export async function updateSareeColour(id: string, input: unknown): Promise<CodeNameFormState> {
  const user = await requireMasterForAction();
  const parsed = codeNameSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.sareeColourMaster.findUniqueOrThrow({ where: { id } });
      const after = await tx.sareeColourMaster.update({ where: { id }, data: parsed.data });
      await writeAuditLog(tx, user.id, 'UPDATE', 'SareeColourMaster', id, before, after);
    });
    revalidatePath('/settings/colours');
    return { id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'That code already exists.' };
    }
    return { error: e instanceof Error ? e.message : 'Could not save colour.' };
  }
}

export async function setSareeColourActive(id: string, isActive: boolean): Promise<CodeNameFormState> {
  const user = await requireMasterForAction();
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.sareeColourMaster.findUniqueOrThrow({ where: { id } });
      const after = await tx.sareeColourMaster.update({ where: { id }, data: { isActive } });
      await writeAuditLog(tx, user.id, 'UPDATE', 'SareeColourMaster', id, before, after);
    });
    revalidatePath('/settings/colours');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update colour.' };
  }
}

// Jari Code master (v2 gap #10) — e.g. "C/S" = Copper/Silver.
export async function createJariCode(input: unknown): Promise<CodeNameFormState> {
  const user = await requireMasterForAction();
  const parsed = codeNameSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.jariCodeMaster.create({ data: parsed.data });
      await writeAuditLog(tx, user.id, 'CREATE', 'JariCodeMaster', row.id, undefined, row);
      return row;
    });
    revalidatePath('/settings/jari-codes');
    return { id: created.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'That code already exists.' };
    }
    return { error: e instanceof Error ? e.message : 'Could not save Jari code.' };
  }
}

export async function updateJariCode(id: string, input: unknown): Promise<CodeNameFormState> {
  const user = await requireMasterForAction();
  const parsed = codeNameSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.jariCodeMaster.findUniqueOrThrow({ where: { id } });
      const after = await tx.jariCodeMaster.update({ where: { id }, data: parsed.data });
      await writeAuditLog(tx, user.id, 'UPDATE', 'JariCodeMaster', id, before, after);
    });
    revalidatePath('/settings/jari-codes');
    return { id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'That code already exists.' };
    }
    return { error: e instanceof Error ? e.message : 'Could not save Jari code.' };
  }
}

export async function setJariCodeActive(id: string, isActive: boolean): Promise<CodeNameFormState> {
  const user = await requireMasterForAction();
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.jariCodeMaster.findUniqueOrThrow({ where: { id } });
      const after = await tx.jariCodeMaster.update({ where: { id }, data: { isActive } });
      await writeAuditLog(tx, user.id, 'UPDATE', 'JariCodeMaster', id, before, after);
    });
    revalidatePath('/settings/jari-codes');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update Jari code.' };
  }
}

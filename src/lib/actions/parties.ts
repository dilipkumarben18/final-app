'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

const partySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['PURCHASE', 'SALES', 'BOTH', 'TRANSPORTER', 'DYEING', 'AGENT', 'JOB_WORKER']),
  mobile: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  gstNumber: z.string().optional(),
  openingBalance: z.coerce.number().default(0),
  creditLimit: z.coerce.number().optional(),
  paymentTerms: z.string().optional(),
});

export type PartyFormState = { error?: string; id?: string };

export async function createParty(input: unknown): Promise<PartyFormState> {
  const user = await requirePermissionForAction('partyMaster');

  const parsed = partySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const created = await prisma.$transaction(async (tx) => {
      const party = await tx.party.create({ data: parsed.data });
      await writeAuditLog(tx, user.id, 'CREATE', 'Party', party.id, undefined, party);
      return party;
    });
    revalidatePath('/parties');
    return { id: created.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save party. Please try again.' };
  }
}

export async function updateParty(id: string, input: unknown): Promise<PartyFormState> {
  const user = await requirePermissionForAction('partyMaster');

  const parsed = partySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.party.findUniqueOrThrow({ where: { id } });
      const after = await tx.party.update({ where: { id }, data: parsed.data });
      await writeAuditLog(tx, user.id, 'UPDATE', 'Party', id, before, after);
    });
    revalidatePath('/parties');
    return { id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save party. Please try again.' };
  }
}

export async function setPartyActive(id: string, isActive: boolean): Promise<PartyFormState> {
  const user = await requirePermissionForAction('partyMaster');

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.party.findUniqueOrThrow({ where: { id } });
      const after = await tx.party.update({ where: { id }, data: { isActive } });
      await writeAuditLog(tx, user.id, 'UPDATE', 'Party', id, before, after);
    });
    revalidatePath('/parties');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update party. Please try again.' };
  }
}

// ----------------------------------------------------------------------------
// BULK IMPORT — CSV-driven party creation (e.g. importing a supplier list
// pulled from a bulk bill-print PDF). One transaction for the whole batch;
// each row is checked against existing parties by GSTIN first (most
// reliable), falling back to a case-insensitive exact name match, so
// re-running an import (or importing an overlapping list) doesn't create
// duplicates. Rows that fail validation or match an existing party are
// reported back rather than silently dropped, so the person doing the
// import can see exactly what happened to each row.
// ----------------------------------------------------------------------------

const bulkImportRowSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['PURCHASE', 'SALES', 'BOTH', 'TRANSPORTER', 'DYEING', 'AGENT', 'JOB_WORKER']).default('PURCHASE'),
  mobile: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  gstNumber: z.string().optional(),
});

export type BulkImportRowResult =
  | { status: 'created'; name: string; id: string }
  | { status: 'skipped'; name: string; reason: string }
  | { status: 'error'; name: string; reason: string };

export type BulkImportResult = { results: BulkImportRowResult[]; error?: string };

export async function bulkImportParties(rows: unknown): Promise<BulkImportResult> {
  const user = await requirePermissionForAction('partyMaster');

  if (!Array.isArray(rows)) return { results: [], error: 'Expected a list of rows.' };
  if (rows.length === 0) return { results: [], error: 'No rows to import.' };
  if (rows.length > 2000) return { results: [], error: 'Too many rows in one import (max 2000).' };

  const results: BulkImportRowResult[] = [];

  await prisma.$transaction(async (tx) => {
    for (const raw of rows) {
      const parsed = bulkImportRowSchema.safeParse(raw);
      if (!parsed.success) {
        const label = typeof (raw as { name?: unknown })?.name === 'string' ? (raw as { name: string }).name : '(unnamed row)';
        results.push({ status: 'error', name: label, reason: parsed.error.issues[0]?.message ?? 'Invalid row' });
        continue;
      }
      const data = parsed.data;

      const existing = data.gstNumber
        ? await tx.party.findFirst({ where: { gstNumber: data.gstNumber } })
        : await tx.party.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' } } });

      if (existing) {
        results.push({
          status: 'skipped',
          name: data.name,
          reason: data.gstNumber ? `GSTIN already used by "${existing.name}"` : `Name already exists`,
        });
        continue;
      }

      try {
        const party = await tx.party.create({ data });
        await writeAuditLog(tx, user.id, 'CREATE', 'Party', party.id, undefined, party);
        results.push({ status: 'created', name: data.name, id: party.id });
      } catch (e) {
        results.push({ status: 'error', name: data.name, reason: e instanceof Error ? e.message : 'Could not save' });
      }
    }
  });

  revalidatePath('/parties');
  return { results };
}

const branchSchema = z.object({
  name: z.string().min(1, 'Branch name is required'),
  address: z.string().optional(),
  phone: z.string().optional(),
});

export async function createBranch(partyId: string, input: unknown): Promise<PartyFormState> {
  const user = await requirePermissionForAction('partyMaster');

  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const created = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({ data: { ...parsed.data, partyId } });
      await writeAuditLog(tx, user.id, 'CREATE', 'Branch', branch.id, undefined, branch);
      return branch;
    });
    revalidatePath('/parties');
    return { id: created.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save branch. Please try again.' };
  }
}

export async function updateBranch(id: string, input: unknown): Promise<PartyFormState> {
  const user = await requirePermissionForAction('partyMaster');

  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.branch.findUniqueOrThrow({ where: { id } });
      const after = await tx.branch.update({ where: { id }, data: parsed.data });
      await writeAuditLog(tx, user.id, 'UPDATE', 'Branch', id, before, after);
    });
    revalidatePath('/parties');
    return { id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save branch. Please try again.' };
  }
}

'use server';

import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMasterForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

type TxClient = Prisma.TransactionClient;

export type ProductionBatchFormState = { error?: string; id?: string };

function revalidateBatches(weaverId: string) {
  revalidatePath('/production-batches');
  revalidatePath(`/production-batches?weaverId=${weaverId}`);
}

async function nextBatchNumber(tx: TxClient, weaverId: string): Promise<number> {
  const count = await tx.productionBatch.count({ where: { weaverId } });
  return count + 1;
}

const createSchema = z.object({
  weaverId: z.string().min(1, 'Weaver is required'),
  notes: z.string().optional(),
});

export async function createProductionBatch(input: unknown): Promise<ProductionBatchFormState> {
  const user = await requireMasterForAction();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.productionBatch.create({
        data: {
          weaverId: data.weaverId,
          batchNumber: await nextBatchNumber(tx, data.weaverId),
          notes: data.notes || undefined,
          createdById: user.id,
        },
      });
      await writeAuditLog(tx, user.id, 'CREATE', 'ProductionBatch', created.id, undefined, created);
      return created;
    });

    revalidateBatches(data.weaverId);
    return { id: batch.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not create Purai.' };
  }
}

const addEntrySchema = z.object({
  productionBatchId: z.string().min(1),
  weaverId: z.string().min(1),
  entryType: z.enum(['WarpAssignment', 'MaterialIssue', 'WeaverWage']),
  entryId: z.string().min(1),
});

// Tags an existing WarpAssignment/MaterialIssue/WeaverWage into this
// Purai — purely additive, doesn't touch the entry's own status/lifecycle.
// Guards that the entry actually belongs to this weaver and isn't already
// tagged elsewhere.
export async function addEntryToBatch(input: unknown): Promise<ProductionBatchFormState> {
  const user = await requireMasterForAction();
  const parsed = addEntrySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.productionBatch.findUniqueOrThrow({ where: { id: data.productionBatchId } });
      if (batch.weaverId !== data.weaverId) throw new Error('That Purai does not belong to this weaver.');

      if (data.entryType === 'WarpAssignment') {
        const entry = await tx.warpAssignment.findUniqueOrThrow({ where: { id: data.entryId } });
        if (entry.weaverId !== data.weaverId) throw new Error('That warp assignment does not belong to this weaver.');
        if (entry.productionBatchId) throw new Error('That warp assignment is already tagged to a Purai.');
        await tx.warpAssignment.update({ where: { id: data.entryId }, data: { productionBatchId: data.productionBatchId } });
      } else if (data.entryType === 'MaterialIssue') {
        const entry = await tx.materialIssue.findUniqueOrThrow({ where: { id: data.entryId } });
        if (entry.weaverId !== data.weaverId) throw new Error('That material issue does not belong to this weaver.');
        if (entry.productionBatchId) throw new Error('That material issue is already tagged to a Purai.');
        await tx.materialIssue.update({ where: { id: data.entryId }, data: { productionBatchId: data.productionBatchId } });
      } else {
        const entry = await tx.weaverWage.findUniqueOrThrow({ where: { id: data.entryId } });
        if (entry.weaverId !== data.weaverId) throw new Error('That wage entry does not belong to this weaver.');
        if (entry.productionBatchId) throw new Error('That wage entry is already tagged to a Purai.');
        await tx.weaverWage.update({ where: { id: data.entryId }, data: { productionBatchId: data.productionBatchId } });
      }

      await writeAuditLog(tx, user.id, 'UPDATE', data.entryType, data.entryId, undefined, { productionBatchId: data.productionBatchId });
    });

    revalidateBatches(data.weaverId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not add entry to Purai.' };
  }
}

const idSchema = z.object({ id: z.string().min(1), weaverId: z.string().min(1) });

// Marks a Purai complete — always succeeds regardless of the checklist
// (computed separately, read-only, in the page itself) — the Master can
// "complete anyway", matching this codebase's don't-block philosophy and
// the reference mockup's own "Complete Anyway" override.
export async function completeProductionBatch(input: unknown): Promise<ProductionBatchFormState> {
  const user = await requireMasterForAction();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.productionBatch.findUniqueOrThrow({ where: { id: data.id } });
      const updated = await tx.productionBatch.update({
        where: { id: data.id },
        data: { status: 'COMPLETED', lockedAt: new Date() },
      });
      await writeAuditLog(tx, user.id, 'UPDATE', 'ProductionBatch', updated.id, before, updated);
    });

    revalidateBatches(data.weaverId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not complete Purai.' };
  }
}

export async function unlockProductionBatch(input: unknown): Promise<ProductionBatchFormState> {
  const user = await requireMasterForAction();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.productionBatch.findUniqueOrThrow({ where: { id: data.id } });
      const updated = await tx.productionBatch.update({
        where: { id: data.id },
        data: { status: 'IN_PRODUCTION', lockedAt: null },
      });
      await writeAuditLog(tx, user.id, 'UPDATE', 'ProductionBatch', updated.id, before, updated);
    });

    revalidateBatches(data.weaverId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not unlock Purai.' };
  }
}

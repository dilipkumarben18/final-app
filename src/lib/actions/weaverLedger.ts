'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMasterForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

export type WeaverLedgerFormState = { error?: string; id?: string };

function revalidateWeaver(weaverId: string) {
  revalidatePath(`/settings/weavers/${weaverId}`);
  revalidatePath('/settings/weavers');
}

const materialIssuedSchema = z.object({
  weaverId: z.string().min(1, 'Weaver is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  date: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
});

// Values material given to a weaver against their running account —
// reduces what's owed to them. Manual entry (the amount is typed by the
// Master, not derived from MaterialIssue/WarpAssignment) — deliberately
// decoupled from the production chain, see CLAUDE.md's "v2 structural-gap
// roadmap" for why.
export async function recordMaterialIssuedToWeaver(input: unknown): Promise<WeaverLedgerFormState> {
  const user = await requireMasterForAction();
  const parsed = materialIssuedSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.weaverLedgerEntry.create({
        data: {
          weaverId: data.weaverId,
          type: 'MATERIAL_ISSUED',
          amount: -data.amount,
          date: new Date(data.date),
          notes: data.notes || undefined,
          createdById: user.id,
        },
      });
      await writeAuditLog(tx, user.id, 'CREATE', 'WeaverLedgerEntry', created.id, undefined, created);
      return created;
    });

    revalidateWeaver(data.weaverId);
    return { id: entry.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not record entry.' };
  }
}

const wageSchema = z.object({
  weaverId: z.string().min(1, 'Weaver is required'),
  sareeTypeId: z.string().optional(),
  warpAssignmentId: z.string().optional(),
  quantity: z.coerce.number().int().positive('Quantity must be greater than 0'),
  rate: z.coerce.number().positive('Rate must be greater than 0'),
  date: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
});

// Piece-rate wages — creates the WeaverWage record and posts a
// WAGES_EARNED ledger entry for quantity x rate in one transaction. No
// separate "mark paid" step here — paid status is computed live from
// linked WeaverPayment rows (see recordWeaverPayment), same convention
// as Purchase/Sale bills computing Paid/Balance from linked Payment rows.
// Whatever rate is used here is also remembered on WeaverSareeType, so
// the next wage for this weaver+sareeType defaults to it — see /wages,
// which is where "set the amount per saree" actually happens, at entry
// time, rather than as a separate settings step.
export async function recordWeaverWage(input: unknown): Promise<WeaverLedgerFormState> {
  const user = await requireMasterForAction();
  const parsed = wageSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;
  const amount = Math.round(data.quantity * data.rate * 100) / 100;

  try {
    const wage = await prisma.$transaction(async (tx) => {
      if (data.warpAssignmentId) {
        const warp = await tx.warpAssignment.findUniqueOrThrow({ where: { id: data.warpAssignmentId } });
        if (warp.weaverId !== data.weaverId) throw new Error('That warp does not belong to this weaver.');
        if (warp.wage) throw new Error('This warp already has a wage recorded.');
      }

      const created = await tx.weaverWage.create({
        data: {
          weaverId: data.weaverId,
          sareeTypeId: data.sareeTypeId || undefined,
          warpAssignmentId: data.warpAssignmentId || undefined,
          quantity: data.quantity,
          rate: data.rate,
          amount,
          date: new Date(data.date),
          notes: data.notes || undefined,
          recordedById: user.id,
        },
      });
      await tx.weaverLedgerEntry.create({
        data: {
          weaverId: data.weaverId,
          type: 'WAGES_EARNED',
          amount,
          refType: 'WeaverWage',
          refId: created.id,
          date: created.date,
          createdById: user.id,
        },
      });
      if (data.sareeTypeId) {
        await tx.weaverSareeType.upsert({
          where: { weaverId_sareeTypeId: { weaverId: data.weaverId, sareeTypeId: data.sareeTypeId } },
          update: { ratePerSaree: data.rate },
          create: { weaverId: data.weaverId, sareeTypeId: data.sareeTypeId, ratePerSaree: data.rate },
        });
      }
      await writeAuditLog(tx, user.id, 'CREATE', 'WeaverWage', created.id, undefined, created);
      return created;
    });

    revalidateWeaver(data.weaverId);
    revalidatePath('/wages');
    return { id: wage.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not record wage.' };
  }
}

const paymentSchema = z.object({
  weaverId: z.string().min(1, 'Weaver is required'),
  weaverWageId: z.string().optional(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  date: z.string().min(1, 'Date is required'),
  method: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export async function recordWeaverPayment(input: unknown): Promise<WeaverLedgerFormState> {
  const user = await requireMasterForAction();
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const payment = await prisma.$transaction(async (tx) => {
      if (data.weaverWageId) {
        const wage = await tx.weaverWage.findUniqueOrThrow({ where: { id: data.weaverWageId } });
        if (wage.weaverId !== data.weaverId) throw new Error('That wage entry does not belong to this weaver.');
      }
      const created = await tx.weaverPayment.create({
        data: {
          weaverId: data.weaverId,
          weaverWageId: data.weaverWageId || undefined,
          amount: data.amount,
          date: new Date(data.date),
          method: data.method || undefined,
          reference: data.reference || undefined,
          notes: data.notes || undefined,
          recordedById: user.id,
        },
      });
      await tx.weaverLedgerEntry.create({
        data: {
          weaverId: data.weaverId,
          type: 'PAYMENT_MADE',
          amount: -data.amount,
          refType: 'WeaverPayment',
          refId: created.id,
          date: created.date,
          createdById: user.id,
        },
      });
      await writeAuditLog(tx, user.id, 'CREATE', 'WeaverPayment', created.id, undefined, created);
      return created;
    });

    revalidateWeaver(data.weaverId);
    revalidatePath('/wages');
    return { id: payment.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not record payment.' };
  }
}

const adjustmentSchema = z.object({
  weaverId: z.string().min(1, 'Weaver is required'),
  direction: z.enum(['CREDIT', 'DEBIT']),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  date: z.string().min(1, 'Date is required'),
  notes: z.string().min(1, 'Notes are required for an adjustment'),
});

// Free-form correction, either direction — same Add/Subtract-style pattern
// as Stock Adjustment (src/lib/actions/stockAdjustment.ts), for anything
// that doesn't fit Material Issued / Wages / Payment.
export async function recordWeaverAdjustment(input: unknown): Promise<WeaverLedgerFormState> {
  const user = await requireMasterForAction();
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;
  const signedAmount = data.direction === 'CREDIT' ? data.amount : -data.amount;

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.weaverLedgerEntry.create({
        data: {
          weaverId: data.weaverId,
          type: 'ADJUSTMENT',
          amount: signedAmount,
          date: new Date(data.date),
          notes: data.notes,
          createdById: user.id,
        },
      });
      await writeAuditLog(tx, user.id, 'CREATE', 'WeaverLedgerEntry', created.id, undefined, created);
      return created;
    });

    revalidateWeaver(data.weaverId);
    return { id: entry.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not record adjustment.' };
  }
}

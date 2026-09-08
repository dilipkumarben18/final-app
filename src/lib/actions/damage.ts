'use server';

import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';
import { uploadPhoto } from '@/lib/storage';

type TxClient = Prisma.TransactionClient;
type StockState = 'NORMAL' | 'DAMAGED' | 'SENT_FOR_REPAIR' | 'UNDER_REPAIR' | 'REPAIRED';

export type DamageFormState = { error?: string; id?: string };

async function nextDamageNumber(tx: TxClient): Promise<string> {
  const count = await tx.damageRegister.count();
  return `DMG-${(count + 1).toString().padStart(6, '0')}`;
}

/** Moves 1 saree of this type at this location from one FinishedStockBalance state to another. */
async function moveStockState(
  tx: TxClient,
  locationId: string,
  sareeTypeId: string,
  from: StockState,
  to: StockState
) {
  const fromBalance = await tx.finishedStockBalance.findUnique({
    where: { locationId_sareeTypeId_state: { locationId, sareeTypeId, state: from } },
  });
  if (!fromBalance || fromBalance.quantity < 1) {
    throw new Error(`No stock in ${from.replace(/_/g, ' ').toLowerCase()} state to move.`);
  }

  await tx.finishedStockBalance.update({
    where: { locationId_sareeTypeId_state: { locationId, sareeTypeId, state: from } },
    data: { quantity: { decrement: 1 } },
  });
  await tx.finishedStockBalance.upsert({
    where: { locationId_sareeTypeId_state: { locationId, sareeTypeId, state: to } },
    create: { locationId, sareeTypeId, state: to, quantity: 1 },
    update: { quantity: { increment: 1 } },
  });
}

const reportSchema = z.object({
  locationId: z.string().optional(),
  sareeTypeId: z.string().optional(),
  weaverId: z.string().optional(),
  sareeReceivingEntryId: z.string().optional(),
  damageType: z.enum(['WEAVING_DEFECT', 'COLOUR_ISSUE', 'JARI_ISSUE', 'BORDER_ISSUE', 'TEAR_CUT', 'STAIN', 'OTHER']),
  description: z.string().optional(),
  repairable: z.enum(['YES', 'NO', '']).optional(),
});

export async function reportDamage(input: unknown): Promise<DamageFormState> {
  const user = await requirePermissionForAction('damageEntry');
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const entry = await prisma.$transaction(async (tx) => {
      // Reported from Saree Book against one specific saree — sareeType,
      // location (always Home now — see receiveSaree) and weaver all come
      // from that saree's own record rather than being picked by hand.
      let sareeTypeId = data.sareeTypeId;
      let locationId = data.locationId;
      let weaverId = data.weaverId;
      let receivingEntry: { id: string; status: string } | null = null;

      if (data.sareeReceivingEntryId) {
        const existing = await tx.sareeReceivingEntry.findUniqueOrThrow({
          where: { id: data.sareeReceivingEntryId },
          include: { warpAssignment: { include: { sareeType: true, weaver: true } } },
        });
        if (existing.status === 'DAMAGED') throw new Error('This saree is already marked Damaged.');
        sareeTypeId = existing.warpAssignment.sareeTypeId;
        weaverId = existing.warpAssignment.weaverId;
        receivingEntry = existing;
        const home = await tx.stockLocation.findFirst({ where: { kind: 'HOME', isActive: true }, orderBy: { name: 'asc' } });
        if (!home) throw new Error('No active Home stock location is set up.');
        locationId = home.id;
      }

      if (!sareeTypeId) throw new Error('Saree type is required.');
      if (!locationId) throw new Error('Location is required.');

      await moveStockState(tx, locationId, sareeTypeId, 'NORMAL', 'DAMAGED');

      const created = await tx.damageRegister.create({
        data: {
          damageNumber: await nextDamageNumber(tx),
          sareeTypeId,
          locationId,
          weaverId: weaverId || undefined,
          sareeReceivingEntryId: data.sareeReceivingEntryId || undefined,
          damageType: data.damageType,
          description: data.description || undefined,
          repairable: data.repairable ? data.repairable === 'YES' : undefined,
          status: 'DAMAGED',
        },
      });

      if (receivingEntry) {
        await tx.sareeReceivingEntry.update({ where: { id: receivingEntry.id }, data: { status: 'DAMAGED' } });
      }

      await writeAuditLog(tx, user.id, 'CREATE', 'DamageRegister', created.id, undefined, created);
      return created;
    });

    revalidatePath('/damage');
    revalidatePath('/stock');
    revalidatePath('/saree-book');
    return { id: entry.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not record damage.' };
  }
}

// Photos can be added at report time or any time after — one or more per
// damage record (spec section 22). Server-only Supabase Storage upload.
export async function uploadDamagePhotos(damageId: string, formData: FormData): Promise<DamageFormState> {
  const user = await requirePermissionForAction('damageEntry');

  const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: 'Choose at least one photo.' };

  try {
    const entry = await prisma.damageRegister.findUniqueOrThrow({ where: { id: damageId } });

    const urls: string[] = [];
    for (const file of files) {
      urls.push(await uploadPhoto('damage', damageId, file));
    }

    const updated = await prisma.damageRegister.update({
      where: { id: damageId },
      data: { photoUrls: [...entry.photoUrls, ...urls] },
    });
    await writeAuditLog(prisma, user.id, 'UPDATE', 'DamageRegister', updated.id, entry, updated);

    revalidatePath('/damage');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not upload photos.' };
  }
}

const sendForRepairSchema = z.object({
  id: z.string().min(1),
  repairer: z.string().min(1, 'Repairer is required'),
  sentOutDate: z.string().min(1, 'Sent-out date is required'),
});

export async function sendForRepair(input: unknown): Promise<DamageFormState> {
  const user = await requirePermissionForAction('damageEntry');
  const parsed = sendForRepairSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.damageRegister.findUniqueOrThrow({ where: { id: data.id } });
      if (entry.status !== 'DAMAGED') throw new Error('This item is not awaiting repair pickup.');

      await moveStockState(tx, entry.locationId, entry.sareeTypeId, 'DAMAGED', 'SENT_FOR_REPAIR');

      const updated = await tx.damageRegister.update({
        where: { id: data.id },
        data: { status: 'SENT_FOR_REPAIR', repairer: data.repairer, sentOutDate: new Date(data.sentOutDate) },
      });
      await writeAuditLog(tx, user.id, 'UPDATE', 'DamageRegister', updated.id, entry, updated);
    });

    revalidatePath('/damage');
    revalidatePath('/stock');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update.' };
  }
}

export async function markUnderRepair(id: string): Promise<DamageFormState> {
  const user = await requirePermissionForAction('damageEntry');

  try {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.damageRegister.findUniqueOrThrow({ where: { id } });
      if (entry.status !== 'SENT_FOR_REPAIR') throw new Error('This item has not been sent for repair yet.');

      await moveStockState(tx, entry.locationId, entry.sareeTypeId, 'SENT_FOR_REPAIR', 'UNDER_REPAIR');

      const updated = await tx.damageRegister.update({ where: { id }, data: { status: 'UNDER_REPAIR' } });
      await writeAuditLog(tx, user.id, 'UPDATE', 'DamageRegister', updated.id, entry, updated);
    });

    revalidatePath('/damage');
    revalidatePath('/stock');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update.' };
  }
}

const markRepairedSchema = z.object({
  id: z.string().min(1),
  repairedDate: z.string().min(1, 'Repaired date is required'),
  repairAmount: z.coerce.number().nonnegative().optional(),
});

export async function markRepaired(input: unknown): Promise<DamageFormState> {
  const user = await requirePermissionForAction('damageEntry');
  const parsed = markRepairedSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.damageRegister.findUniqueOrThrow({ where: { id: data.id } });
      if (entry.status !== 'SENT_FOR_REPAIR' && entry.status !== 'UNDER_REPAIR') {
        throw new Error('This item is not currently out for repair.');
      }

      await moveStockState(tx, entry.locationId, entry.sareeTypeId, entry.status, 'REPAIRED');

      const updated = await tx.damageRegister.update({
        where: { id: data.id },
        data: { status: 'REPAIRED', repairedDate: new Date(data.repairedDate), repairAmount: data.repairAmount },
      });
      await writeAuditLog(tx, user.id, 'UPDATE', 'DamageRegister', updated.id, entry, updated);
    });

    revalidatePath('/damage');
    revalidatePath('/stock');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update.' };
  }
}

// A saree can turn out non-repairable from any pre-REPAIRED state — this is
// a terminal disposition, distinct from REPAIRED, per spec's status list.
// The saree stays counted as DAMAGED stock (written off), it does not move.
export async function markNonRepairable(id: string): Promise<DamageFormState> {
  const user = await requirePermissionForAction('damageEntry');

  try {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.damageRegister.findUniqueOrThrow({ where: { id } });
      if (!['DAMAGED', 'SENT_FOR_REPAIR', 'UNDER_REPAIR'].includes(entry.status)) {
        throw new Error('This item cannot be marked non-repairable from its current status.');
      }

      const updated = await tx.damageRegister.update({
        where: { id },
        data: { status: 'NON_REPAIRABLE', repairable: false },
      });
      await writeAuditLog(tx, user.id, 'UPDATE', 'DamageRegister', updated.id, entry, updated);
    });

    revalidatePath('/damage');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update.' };
  }
}

export async function returnToStock(id: string): Promise<DamageFormState> {
  const user = await requirePermissionForAction('damageEntry');

  try {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.damageRegister.findUniqueOrThrow({ where: { id } });
      if (entry.status !== 'REPAIRED') throw new Error('This item is not marked repaired yet.');

      await moveStockState(tx, entry.locationId, entry.sareeTypeId, 'REPAIRED', 'NORMAL');

      const updated = await tx.damageRegister.update({ where: { id }, data: { status: 'BACK_TO_NORMAL_STOCK' } });
      await writeAuditLog(tx, user.id, 'UPDATE', 'DamageRegister', updated.id, entry, updated);
    });

    revalidatePath('/damage');
    revalidatePath('/stock');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update.' };
  }
}

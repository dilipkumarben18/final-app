'use server';

import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';
import { uploadPhoto } from '@/lib/storage';

type TxClient = Prisma.TransactionClient;

export type ReceivingFormState = {
  error?: string;
  id?: string;
  serialNumber?: string;
  warpColour?: string | null;
  weftColour?: string | null;
  jariColour?: string | null;
  photoUrls?: string[];
};

export async function nextSareeSerial(tx: TxClient): Promise<string> {
  const count = await tx.sareeReceivingEntry.count();
  return `SR-${(count + 1).toString().padStart(6, '0')}`;
}

// Best-effort colour snapshot at receive time (v2 gap #3 — see CLAUDE.md's
// "v2 structural-gap roadmap") — warp colour comes from the physical warp's
// shade lines, weft/jari colour from whichever brand/colour was most
// recently issued against this assignment. Approximate by nature (a saree
// isn't tied to one specific MaterialIssue event), editable after the fact.
export async function deriveSareeColours(
  tx: TxClient,
  warpAssignmentId: string
): Promise<{ warpColour: string | null; weftColour: string | null; jariColour: string | null }> {
  const warp = await tx.warpAssignment.findUnique({
    where: { id: warpAssignmentId },
    include: { dyeingBatchWarp: { include: { shadeLines: true } } },
  });
  const warpColour =
    warp?.dyeingBatchWarp?.shadeLines.map((l) => l.shadeNumber.trim()).filter(Boolean).join(', ') || null;

  const lastIssue = await tx.materialIssue.findFirst({
    where: { warpAssignmentId },
    orderBy: { date: 'desc' },
  });

  let weftColour: string | null = null;
  let jariColour: string | null = null;
  if (lastIssue) {
    const txns = await tx.rawMaterialTransaction.findMany({
      where: { refType: 'MaterialIssue', refId: lastIssue.id },
      include: { rawMaterial: { select: { name: true, category: true } } },
    });
    const weftNames = txns.filter((t) => t.rawMaterial.category === 'WEFT').map((t) => t.rawMaterial.name);
    const jariNames = txns.filter((t) => t.rawMaterial.category === 'JARI').map((t) => t.rawMaterial.name);
    weftColour = weftNames.join(', ') || null;
    jariColour = jariNames.join(', ') || null;
  }

  return { warpColour, weftColour, jariColour };
}

const receiveSchema = z.object({
  warpAssignmentId: z.string().min(1),
  sareeNumber: z.coerce.number().int().min(1).max(23, 'Saree 24 is handled through the changeover step'),
});

export async function receiveSaree(input: unknown): Promise<ReceivingFormState> {
  const user = await requirePermissionForAction('sareeReceiving');

  const parsed = receiveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const assignment = await tx.warpAssignment.findUniqueOrThrow({
        where: { id: data.warpAssignmentId },
        include: { weaver: true },
      });
      if (assignment.status !== 'STARTED') {
        throw new Error('This warp is not currently in progress.');
      }

      const existing = await tx.sareeReceivingEntry.findUnique({
        where: { warpAssignmentId_sareeNumber: { warpAssignmentId: data.warpAssignmentId, sareeNumber: data.sareeNumber } },
      });
      if (existing) throw new Error(`Saree ${data.sareeNumber} is already marked received.`);

      const colours = await deriveSareeColours(tx, data.warpAssignmentId);

      const created = await tx.sareeReceivingEntry.create({
        data: {
          warpAssignmentId: data.warpAssignmentId,
          sareeNumber: data.sareeNumber,
          receivedById: user.id,
          serialNumber: await nextSareeSerial(tx),
          ...colours,
        },
      });

      // Straight to Home/ready-to-sale stock — no Godown stock leg or
      // manual transfer step. The weaver's Godown (assignedLocationId)
      // is still recorded via warpAssignment.weaver, so "sarees produced
      // per godown" stays fully reportable (see Reports > Godown
      // Production) — it's just never a live stock bucket to sell from.
      const homeLocation = await tx.stockLocation.findFirst({
        where: { kind: 'HOME', isActive: true },
        orderBy: { name: 'asc' },
      });
      if (!homeLocation) throw new Error('No active Home stock location is set up yet — add one in Settings.');

      await tx.finishedStockBalance.upsert({
        where: {
          locationId_sareeTypeId_state: {
            locationId: homeLocation.id,
            sareeTypeId: assignment.sareeTypeId,
            state: 'NORMAL',
          },
        },
        create: {
          locationId: homeLocation.id,
          sareeTypeId: assignment.sareeTypeId,
          state: 'NORMAL',
          quantity: 1,
        },
        update: { quantity: { increment: 1 } },
      });

      await writeAuditLog(tx, user.id, 'CREATE', 'SareeReceivingEntry', created.id, undefined, created);
      return created;
    });

    revalidatePath('/saree-receiving');
    revalidatePath('/warp-alerts');
    revalidatePath('/stock');
    revalidatePath('/saree-book');
    return {
      id: created.id,
      serialNumber: created.serialNumber,
      warpColour: created.warpColour,
      weftColour: created.weftColour,
      jariColour: created.jariColour,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not mark saree received.' };
  }
}

const detailsSchema = z.object({
  id: z.string().min(1),
  weightGram: z.coerce.number().positive().optional(),
  designName: z.string().optional(),
  warpColour: z.string().optional(),
  weftColour: z.string().optional(),
  jariColour: z.string().optional(),
});

// Fills in weight/design/colour after the fact — optional, not blocking
// the receive tick itself. Colours default from the auto-captured
// snapshot at receive time but can be corrected here since that snapshot
// is only a best guess.
export async function updateSareeDetails(input: unknown): Promise<ReceivingFormState> {
  const user = await requirePermissionForAction('sareeReceiving');
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const before = await prisma.sareeReceivingEntry.findUniqueOrThrow({ where: { id: data.id } });
    const updated = await prisma.sareeReceivingEntry.update({
      where: { id: data.id },
      data: {
        weightGram: data.weightGram,
        designName: data.designName || undefined,
        warpColour: data.warpColour || undefined,
        weftColour: data.weftColour || undefined,
        jariColour: data.jariColour || undefined,
      },
    });
    await writeAuditLog(prisma, user.id, 'UPDATE', 'SareeReceivingEntry', updated.id, before, updated);

    revalidatePath('/saree-receiving');
    revalidatePath('/saree-book');
    return { id: updated.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update saree details.' };
  }
}

// One or more photos per saree, addable any time after receiving — same
// pattern as uploadDamagePhotos in damage.ts, reusing the same Supabase
// Storage helper (photos land in the same bucket, keyed by this entry's id
// instead of a damage record's id).
export async function uploadSareePhotos(sareeReceivingEntryId: string, formData: FormData): Promise<ReceivingFormState> {
  const user = await requirePermissionForAction('sareeReceiving');

  const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: 'Choose at least one photo.' };

  try {
    const entry = await prisma.sareeReceivingEntry.findUniqueOrThrow({ where: { id: sareeReceivingEntryId } });

    const urls: string[] = [];
    for (const file of files) {
      urls.push(await uploadPhoto('saree', sareeReceivingEntryId, file));
    }

    const updated = await prisma.sareeReceivingEntry.update({
      where: { id: sareeReceivingEntryId },
      data: { photoUrls: [...entry.photoUrls, ...urls] },
    });
    await writeAuditLog(prisma, user.id, 'UPDATE', 'SareeReceivingEntry', updated.id, entry, updated);

    revalidatePath('/saree-book');
    return { id: updated.id, photoUrls: updated.photoUrls };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not upload photos.' };
  }
}

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['IN_STOCK', 'SOLD', 'DAMAGED']),
});

// Manual status override from Saree Book — for correcting/reconciling a
// specific serial's status by hand (e.g. sold outside the normal Sales
// flow, or fixing a mis-tagged row). This does NOT touch
// FinishedStockBalance/quantity-based stock — those are still driven by
// the aggregate Sale/Damage flows, same as the model comment notes; this
// is purely the per-serial record so Saree Book reflects reality.
export async function updateSareeStatus(input: unknown): Promise<ReceivingFormState> {
  const user = await requirePermissionForAction('sareeReceiving');
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const existing = await prisma.sareeReceivingEntry.findUniqueOrThrow({ where: { id: data.id } });
    const updated = await prisma.sareeReceivingEntry.update({ where: { id: data.id }, data: { status: data.status } });
    await writeAuditLog(prisma, user.id, 'UPDATE', 'SareeReceivingEntry', updated.id, existing, updated);
    revalidatePath('/saree-book');
    return { id: updated.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update status.' };
  }
}

const unreceiveSchema = z.object({
  warpAssignmentId: z.string().min(1),
  sareeNumber: z.coerce.number().int().min(1).max(23),
});

// Undoes a mis-click — removes the receiving entry and reverses the stock
// increment it caused. Blocked once the 24th saree has been marked woven
// for this warp, since that step requires all 23 to genuinely already be
// received; un-receiving one afterward would leave that fact inconsistent.
export async function unreceiveSaree(input: unknown): Promise<ReceivingFormState> {
  const user = await requirePermissionForAction('sareeReceiving');

  const parsed = unreceiveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const assignment = await tx.warpAssignment.findUniqueOrThrow({
        where: { id: data.warpAssignmentId },
        include: { weaver: true },
      });
      if (assignment.twentyFourthWovenAt) {
        throw new Error('Cannot undo — the 24th saree has already been marked woven for this warp.');
      }

      const existing = await tx.sareeReceivingEntry.findUnique({
        where: { warpAssignmentId_sareeNumber: { warpAssignmentId: data.warpAssignmentId, sareeNumber: data.sareeNumber } },
      });
      if (!existing) throw new Error(`Saree ${data.sareeNumber} was not marked received.`);

      await tx.sareeReceivingEntry.delete({ where: { id: existing.id } });

      const homeLocation = await tx.stockLocation.findFirst({
        where: { kind: 'HOME', isActive: true },
        orderBy: { name: 'asc' },
      });
      if (!homeLocation) throw new Error('No active Home stock location is set up.');

      await tx.finishedStockBalance.update({
        where: {
          locationId_sareeTypeId_state: {
            locationId: homeLocation.id,
            sareeTypeId: assignment.sareeTypeId,
            state: 'NORMAL',
          },
        },
        data: { quantity: { decrement: 1 } },
      });

      await writeAuditLog(tx, user.id, 'DELETE', 'SareeReceivingEntry', existing.id, existing, undefined);
    });

    revalidatePath('/saree-receiving');
    revalidatePath('/warp-alerts');
    revalidatePath('/stock');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not undo receiving.' };
  }
}

const wovenSchema = z.object({ warpAssignmentId: z.string().min(1) });

// The 24th saree is done on the machine but stays there — it is NOT added
// to stock here (spec section 9). This just records that fact and, if a
// next warp is already prepared, flips it to WAITING_TO_START.
export async function markTwentyFourthWoven(input: unknown): Promise<ReceivingFormState> {
  const user = await requirePermissionForAction('sareeReceiving');

  const parsed = wovenSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const assignment = await tx.warpAssignment.findUniqueOrThrow({
        where: { id: data.warpAssignmentId },
        include: { receivingEntries: true, nextAssignment: true },
      });
      if (assignment.status !== 'STARTED') throw new Error('This warp is not currently in progress.');
      if (assignment.twentyFourthWovenAt) throw new Error('The 24th saree is already marked woven.');
      if (assignment.receivingEntries.length < 23) {
        throw new Error(`Only ${assignment.receivingEntries.length}/23 sarees received so far.`);
      }

      const updated = await tx.warpAssignment.update({
        where: { id: assignment.id },
        data: { twentyFourthWovenAt: new Date() },
      });

      if (assignment.nextAssignment && assignment.nextAssignment.status === 'ASSIGNED') {
        await tx.warpAssignment.update({
          where: { id: assignment.nextAssignment.id },
          data: { status: 'WAITING_TO_START' },
        });
      }

      await writeAuditLog(tx, user.id, 'UPDATE', 'WarpAssignment', updated.id, assignment, updated);
    });

    revalidatePath('/saree-receiving');
    revalidatePath('/warp-alerts');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update.' };
  }
}

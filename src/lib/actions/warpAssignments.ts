'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';
import { nextSareeSerial, deriveSareeColours } from './sareeReceiving';

export type WarpAssignmentFormState = { error?: string; id?: string };

const assignWarpSchema = z.object({
  weaverId: z.string().min(1, 'Weaver is required'),
  sareeTypeId: z.string().min(1, 'Saree type is required'),
  dyeingBatchWarpId: z.string().min(1, 'Pick a dyed warp to assign'),
  assignmentDate: z.string().min(1, 'Assignment date is required'),
  remarks: z.string().optional(),
  // Ordered list of this warp's DyeingShadeLine ids — the colour sequence
  // along the warp, arranged here (not at dyeing time) because it's only
  // once a weaver is chosen that Jari/Weft matching actually matters. If
  // omitted, existing order values (or creation order, for warps assigned
  // before this existed) are left as-is.
  shadeOrder: z.array(z.string()).optional(),
});

// Assigning a warp is preparation only — it does NOT start the warp (spec
// section 8); the actual start date is recorded later via
// recordWarpStartDate. A warp is always handed over whole — the Master
// picks one already-received physical DyeingBatchWarp (whatever mix of
// shades it happens to contain) and the full thing goes to one weaver, so
// there's no shade-quantity bookkeeping to reserve here anymore.
export async function assignWarp(input: unknown): Promise<WarpAssignmentFormState> {
  const user = await requirePermissionForAction('assignWarp');

  const parsed = assignWarpSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const assignment = await prisma.$transaction(async (tx) => {
      const pending = await tx.warpAssignment.findFirst({
        where: { weaverId: data.weaverId, status: { in: ['ASSIGNED', 'WAITING_TO_START'] } },
      });
      if (pending) throw new Error('This weaver already has a warp prepared and waiting to start.');

      const physicalWarp = await tx.dyeingBatchWarp.findUnique({
        where: { id: data.dyeingBatchWarpId },
        include: { warpAssignment: true, shadeLines: true },
      });
      if (!physicalWarp) throw new Error('That warp could not be found.');
      if (!physicalWarp.receivedAt) throw new Error('This warp has not been received from dyeing yet.');
      if (physicalWarp.warpAssignment) throw new Error('This warp has already been assigned to a weaver.');

      if (data.shadeOrder) {
        const existingIds = new Set(physicalWarp.shadeLines.map((l) => l.id));
        const providedIds = new Set(data.shadeOrder);
        if (existingIds.size !== providedIds.size || [...existingIds].some((id) => !providedIds.has(id))) {
          throw new Error('Colour order does not match this warp\'s shade lines.');
        }
        for (let i = 0; i < data.shadeOrder.length; i++) {
          await tx.dyeingShadeLine.update({ where: { id: data.shadeOrder[i] }, data: { order: i + 1 } });
        }
      }

      // The weaver can briefly have two STARTED assignments during a
      // changeover (old one awaiting cut + new one already active). The
      // "previous" one for chaining/changeover-duration purposes should
      // prefer the active one (still being woven) — but in the normal
      // case of assigning the next warp right after the current one's
      // 24th is woven, there IS no active one yet, so fall back to the
      // one awaiting cut. Only if neither exists is there truly no chain.
      const current =
        (await tx.warpAssignment.findFirst({
          where: { weaverId: data.weaverId, status: 'STARTED', twentyFourthWovenAt: null },
        })) ??
        (await tx.warpAssignment.findFirst({
          where: { weaverId: data.weaverId, status: 'STARTED', twentyFourthWovenAt: { not: null }, completedAt: null },
        }));

      const created = await tx.warpAssignment.create({
        data: {
          weaverId: data.weaverId,
          sareeTypeId: data.sareeTypeId,
          dyeingBatchWarpId: physicalWarp.id,
          assignmentDate: new Date(data.assignmentDate),
          remarks: data.remarks || undefined,
          assignedById: user.id,
          previousAssignmentId: current?.id,
          status: current?.twentyFourthWovenAt ? 'WAITING_TO_START' : 'ASSIGNED',
        },
      });

      await writeAuditLog(tx, user.id, 'CREATE', 'WarpAssignment', created.id, undefined, created);
      return created;
    });

    revalidatePath('/warp-alerts');
    revalidatePath('/production');
    return { id: assignment.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not assign warp.' };
  }
}

const startDateSchema = z.object({
  warpAssignmentId: z.string().min(1),
  warpStartDate: z.string().min(1, 'Start date is required'),
});

// The actual date the weaver starts weaving a prepared warp — separate from
// assignmentDate (spec section 8's "assigned date is NOT the warp start date").
export async function recordWarpStartDate(input: unknown): Promise<WarpAssignmentFormState> {
  const user = await requirePermissionForAction('assignWarp');

  const parsed = startDateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const assignment = await tx.warpAssignment.findUniqueOrThrow({ where: { id: data.warpAssignmentId } });
      if (assignment.status === 'STARTED' || assignment.status === 'COMPLETED') {
        throw new Error('This warp has already been started.');
      }

      const updated = await tx.warpAssignment.update({
        where: { id: data.warpAssignmentId },
        data: { warpStartDate: new Date(data.warpStartDate), status: 'STARTED' },
      });
      await writeAuditLog(tx, user.id, 'UPDATE', 'WarpAssignment', updated.id, assignment, updated);
    });

    revalidatePath('/warp-alerts');
    revalidatePath('/saree-receiving');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not record warp start date.' };
  }
}

const cutSchema = z.object({ warpAssignmentId: z.string().min(1) });

// Only callable once the next warp has actually started (spec section 9) —
// releases the 24th saree that's been held on the machine into stock and
// marks the old warp fully completed.
export async function cutAndReceiveTwentyFourth(input: unknown): Promise<WarpAssignmentFormState> {
  const user = await requirePermissionForAction('sareeReceiving');

  const parsed = cutSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const assignment = await tx.warpAssignment.findUniqueOrThrow({
        where: { id: data.warpAssignmentId },
        include: { nextAssignment: true, weaver: true },
      });

      if (!assignment.twentyFourthWovenAt) {
        throw new Error('The 24th saree has not been marked as woven yet.');
      }
      if (assignment.completedAt) {
        throw new Error('This warp has already been completed.');
      }
      if (!assignment.nextAssignment || assignment.nextAssignment.status !== 'STARTED') {
        throw new Error('The new warp must be started before the 24th saree can be cut and received.');
      }

      const colours = await deriveSareeColours(tx, assignment.id);
      await tx.sareeReceivingEntry.create({
        data: {
          warpAssignmentId: assignment.id,
          sareeNumber: 24,
          receivedById: user.id,
          serialNumber: await nextSareeSerial(tx),
          ...colours,
        },
      });

      // Straight to Home stock, same as receiveSaree — see that function's
      // comment for why the Godown is no longer a live stock leg.
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

      const updated = await tx.warpAssignment.update({
        where: { id: assignment.id },
        data: { completedAt: new Date(), status: 'COMPLETED' },
      });
      await writeAuditLog(tx, user.id, 'UPDATE', 'WarpAssignment', updated.id, assignment, updated);
    });

    revalidatePath('/warp-alerts');
    revalidatePath('/saree-receiving');
    revalidatePath('/stock');
    revalidatePath('/saree-book');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not complete the warp.' };
  }
}

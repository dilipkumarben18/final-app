'use server';

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

type TxClient = Prisma.TransactionClient;
type OrderStatus = 'ORDER_PLACED' | 'WARP_DYEING' | 'WEAVING' | 'READY' | 'DELIVERED' | 'CANCELLED';

export type OrderFormState = { error?: string; id?: string };

async function nextOrderNumber(tx: TxClient): Promise<string> {
  const count = await tx.order.count();
  return `ORD-${(count + 1).toString().padStart(6, '0')}`;
}

const createOrderSchema = z.object({
  partyId: z.string().min(1, 'Party is required'),
  sareeTypeId: z.string().min(1, 'Saree type is required'),
  quantity: z.coerce.number().int().positive('Quantity must be greater than 0'),
  rate: z.coerce.number().nonnegative('Price cannot be negative'),
  warpColour: z.string().optional(),
  weftColour: z.string().optional(),
  jariColour: z.string().optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

// Takes a customer order before production starts — separate from Sale,
// which records the actual delivered/billed transaction later. `status` is
// a manual checklist (see the schema comment on Order for why it isn't
// derived from real DyeingBatch/WarpAssignment records).
export async function createOrder(input: unknown): Promise<OrderFormState> {
  const user = await requirePermissionForAction('orders');
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  const totalAmount = Math.round(data.quantity * data.rate * 100) / 100;

  try {
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber: await nextOrderNumber(tx),
          partyId: data.partyId,
          sareeTypeId: data.sareeTypeId,
          quantity: data.quantity,
          rate: data.rate,
          totalAmount,
          warpColour: data.warpColour || undefined,
          weftColour: data.weftColour || undefined,
          jariColour: data.jariColour || undefined,
          description: data.description || undefined,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          notes: data.notes || undefined,
          createdById: user.id,
        },
      });
      await writeAuditLog(tx, user.id, 'CREATE', 'Order', created.id, undefined, created);
      return created;
    });

    revalidatePath('/orders');
    return { id: order.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'Could not generate a unique order number — please try again.' };
    }
    return { error: e instanceof Error ? e.message : 'Could not save order. Please try again.' };
  }
}

async function transition(id: string, from: OrderStatus[], to: OrderStatus, actorId: string) {
  const entry = await prisma.$transaction(async (tx) => {
    const before = await tx.order.findUniqueOrThrow({ where: { id } });
    if (!from.includes(before.status)) {
      throw new Error(`This order is currently "${before.status.replace(/_/g, ' ').toLowerCase()}" and can't move to that stage from here.`);
    }
    const after = await tx.order.update({ where: { id }, data: { status: to } });
    await writeAuditLog(tx, actorId, 'UPDATE', 'Order', after.id, before, after);
    return after;
  });
  revalidatePath('/orders');
  return entry;
}

export async function markWarpDyeing(id: string): Promise<OrderFormState> {
  const user = await requirePermissionForAction('orders');
  try {
    await transition(id, ['ORDER_PLACED'], 'WARP_DYEING', user.id);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update order.' };
  }
}

export async function markWeaving(id: string): Promise<OrderFormState> {
  const user = await requirePermissionForAction('orders');
  try {
    await transition(id, ['WARP_DYEING'], 'WEAVING', user.id);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update order.' };
  }
}

export async function markReady(id: string): Promise<OrderFormState> {
  const user = await requirePermissionForAction('orders');
  try {
    await transition(id, ['WEAVING'], 'READY', user.id);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update order.' };
  }
}

export async function markDelivered(id: string): Promise<OrderFormState> {
  const user = await requirePermissionForAction('orders');
  try {
    await transition(id, ['READY'], 'DELIVERED', user.id);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update order.' };
  }
}

export async function cancelOrder(id: string): Promise<OrderFormState> {
  const user = await requirePermissionForAction('orders');
  try {
    await transition(id, ['ORDER_PLACED', 'WARP_DYEING', 'WEAVING', 'READY'], 'CANCELLED', user.id);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not cancel order.' };
  }
}

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

export type PaymentFormState = { error?: string; id?: string };

const recordPaymentSchema = z.object({
  partyId: z.string().min(1, 'Party is required'),
  direction: z.enum(['PAID', 'RECEIVED']),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  date: z.string().min(1, 'Date is required'),
  method: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  purchaseId: z.string().optional(),
  saleId: z.string().optional(),
  dyeingBatchId: z.string().optional(),
});

// Payments are append-only, like the rest of the money trail (no edit/delete
// action) — same "fix typos via a new correcting entry" reasoning as
// Branch's no-delete-action gap noted in CLAUDE.md.
export async function recordPayment(input: unknown): Promise<PaymentFormState> {
  const user = await requirePermissionForAction('payments');

  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const payment = await prisma.$transaction(async (tx) => {
      if (data.purchaseId) {
        const purchase = await tx.purchase.findUniqueOrThrow({ where: { id: data.purchaseId } });
        if (purchase.partyId !== data.partyId) throw new Error('That purchase does not belong to this party.');
      }
      if (data.saleId) {
        const sale = await tx.sale.findUniqueOrThrow({ where: { id: data.saleId } });
        if (sale.partyId !== data.partyId) throw new Error('That sale does not belong to this party.');
      }
      if (data.dyeingBatchId) {
        const dyeingBatch = await tx.dyeingBatch.findUniqueOrThrow({ where: { id: data.dyeingBatchId } });
        if (dyeingBatch.partyId !== data.partyId) throw new Error('That dyeing batch does not belong to this party.');
      }

      const created = await tx.payment.create({
        data: {
          partyId: data.partyId,
          direction: data.direction,
          amount: data.amount,
          date: new Date(data.date),
          method: data.method || undefined,
          reference: data.reference || undefined,
          notes: data.notes || undefined,
          purchaseId: data.purchaseId || undefined,
          saleId: data.saleId || undefined,
          dyeingBatchId: data.dyeingBatchId || undefined,
          recordedById: user.id,
        },
      });

      await writeAuditLog(tx, user.id, 'CREATE', 'Payment', created.id, undefined, created);
      return created;
    });

    revalidatePath('/payments');
    revalidatePath(`/payments/${data.partyId}`);
    return { id: payment.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not record payment.' };
  }
}

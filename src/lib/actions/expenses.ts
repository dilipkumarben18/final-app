'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMasterForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

export type ExpenseFormState = { error?: string; id?: string };

const recordExpenseSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  category: z.enum(['MANUFACTURING', 'OTHER']),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  notes: z.string().optional(),
  firmId: z.string().optional(),
});

// Feeds the simplified P&L on /reports. Append-only, like Payment — no
// edit/delete, same "correct via a new entry" convention.
export async function recordExpense(input: unknown): Promise<ExpenseFormState> {
  const user = await requireMasterForAction();
  const parsed = recordExpenseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          date: new Date(data.date),
          category: data.category,
          amount: data.amount,
          notes: data.notes || undefined,
          firmId: data.firmId || undefined,
          recordedById: user.id,
        },
      });
      await writeAuditLog(tx, user.id, 'CREATE', 'Expense', created.id, undefined, created);
      return created;
    });

    revalidatePath('/reports');
    return { id: expense.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not record expense.' };
  }
}

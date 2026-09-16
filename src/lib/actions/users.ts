'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMasterForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

const workerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  mobile: z.string().min(6, 'Enter a valid mobile number'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
});

export type UserFormState = { error?: string; id?: string };

// Worker access is a fixed capability set (see src/lib/permissions.ts), not
// configurable per account — there is nothing to grant here beyond the
// account itself.
export async function createWorker(input: unknown): Promise<UserFormState> {
  const actor = await requireMasterForAction();
  const parsed = workerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { mobile: data.mobile } });
    if (existing) return { error: 'That mobile number is already in use.' };

    const passwordHash = await bcrypt.hash(data.password, 10);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          mobile: data.mobile,
          passwordHash,
          role: 'WORKER',
        },
      });
      await writeAuditLog(tx, actor.id, 'CREATE', 'User', user.id, undefined, {
        ...user,
        passwordHash: undefined,
      });
      return user;
    });

    revalidatePath('/settings/users');
    return { id: created.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'That mobile number is already in use.' };
    }
    return { error: e instanceof Error ? e.message : 'Could not create worker account. Please try again.' };
  }
}

export async function setUserActive(userId: string, isActive: boolean): Promise<UserFormState> {
  const actor = await requireMasterForAction();

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const after = await tx.user.update({ where: { id: userId }, data: { isActive } });
      await writeAuditLog(
        tx,
        actor.id,
        'UPDATE',
        'User',
        userId,
        { ...before, passwordHash: undefined },
        { ...after, passwordHash: undefined }
      );
    });
    revalidatePath('/settings/users');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update user. Please try again.' };
  }
}

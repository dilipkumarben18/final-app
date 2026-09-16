import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { can, PermissionKey } from '@/lib/permissions';

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

/** Use in server components/pages. Redirects to /login if not signed in. */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

/** Use in server components/pages that are Master-only. */
export async function requireMaster() {
  const user = await requireUser();
  if (user.role !== 'MASTER') redirect('/dashboard');
  return user;
}

/** Use in server components/pages gated by a Worker permission key. */
export async function requirePermission(key: PermissionKey) {
  const user = await requireUser();
  if (!can(user, key)) redirect('/dashboard');
  return user;
}

/**
 * Use inside Server Actions, which can't redirect the same way — throw
 * instead so the caller can show an error toast.
 */
export async function requireUserForAction() {
  const user = await getSessionUser();
  if (!user) throw new Error('Not signed in.');
  return user;
}

export async function requireMasterForAction() {
  const user = await requireUserForAction();
  if (user.role !== 'MASTER') throw new Error('Only the Master account can do this.');
  return user;
}

export async function requirePermissionForAction(key: PermissionKey) {
  const user = await requireUserForAction();
  if (!can(user, key)) throw new Error('You do not have permission to do this.');
  return user;
}

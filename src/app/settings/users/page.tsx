import { prisma } from '@/lib/prisma';
import { UsersClient } from './UsersClient';

export default async function UsersPage() {
  const workers = await prisma.user.findMany({
    where: { role: 'WORKER' },
    orderBy: { name: 'asc' },
  });

  const serialized = workers.map((w) => ({
    id: w.id,
    name: w.name,
    mobile: w.mobile,
    isActive: w.isActive,
  }));

  return <UsersClient workers={serialized} />;
}

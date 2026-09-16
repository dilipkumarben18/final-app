import { prisma } from '@/lib/prisma';
import { computeWeaverBalances } from '@/lib/weaverBalance';
import { WeaversClient } from './WeaversClient';

export default async function WeaversPage() {
  const [weavers, locations, sareeTypes, balances] = await Promise.all([
    prisma.weaverProfile.findMany({
      include: { assignedLocation: true, sareeTypes: { include: { sareeType: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.stockLocation.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.sareeType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    computeWeaverBalances(),
  ]);

  const balanceByWeaver = new Map(balances.map((b) => [b.id, b.balance]));
  const weaversWithBalance = weavers.map((w) => ({ ...w, balance: balanceByWeaver.get(w.id) ?? 0 }));

  return <WeaversClient weavers={weaversWithBalance} locations={locations} sareeTypes={sareeTypes} />;
}

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { JariLotsClient } from './JariLotsClient';

export default async function JariLotsPage() {
  await requirePermission('jariLots');

  const [unassigned, assigned, jariMaterials] = await Promise.all([
    prisma.jariLot.findMany({
      where: { status: 'UNASSIGNED' },
      include: { party: true, purchase: true },
      orderBy: { receivedDate: 'asc' },
    }),
    prisma.jariLot.findMany({
      where: { status: 'ASSIGNED' },
      include: { party: true, purchase: true, assignedMaterial: true },
      orderBy: { assignedAt: 'desc' },
      take: 30,
    }),
    prisma.rawMaterial.findMany({ where: { category: 'JARI' }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Jari Lots</h1>
        <p className="mt-1 text-sm text-ink/60">
          Boxes of Jari received against a Purchase, waiting to be opened, checked, and named a brand — until
          then they don&apos;t count toward Raw Material stock.
        </p>

        <div className="mt-6">
          <JariLotsClient
            unassigned={unassigned.map((l) => ({
              id: l.id,
              partyName: l.party.name,
              purchaseNumber: l.purchase.purchaseNumber,
              sourceMaterialName: l.sourceMaterialName,
              quantity: l.quantity.toString(),
              unit: l.unit,
              receivedDate: l.receivedDate.toISOString(),
            }))}
            assigned={assigned.map((l) => ({
              id: l.id,
              partyName: l.party.name,
              purchaseNumber: l.purchase.purchaseNumber,
              quantity: l.quantity.toString(),
              unit: l.unit,
              brandName: l.assignedMaterial?.name ?? '—',
              assignedAt: l.assignedAt ? l.assignedAt.toISOString() : null,
            }))}
            jariMaterials={jariMaterials.map((m) => ({ id: m.id, name: m.name }))}
          />
        </div>
      </main>
    </div>
  );
}

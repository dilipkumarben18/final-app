import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { NewPurchaseForm } from './NewPurchaseForm';

export default async function NewPurchasePage() {
  await requirePermission('purchaseEntry');

  const [firms, parties, rawMaterials] = await Promise.all([
    prisma.firm.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.party.findMany({
      where: { isActive: true, type: { in: ['PURCHASE', 'BOTH'] } },
      include: { branches: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    }),
    prisma.rawMaterial.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">New Purchase</h1>
        <p className="mt-1 text-sm text-ink/60">Record a raw material purchase and update stock.</p>

        <div className="mt-6 max-w-3xl">
          <NewPurchaseForm
            firms={firms.map((f) => ({ id: f.id, name: f.name }))}
            parties={parties.map((p) => ({
              id: p.id,
              name: p.name,
              branches: p.branches.map((b) => ({ id: b.id, name: b.name, address: b.address })),
            }))}
            rawMaterials={rawMaterials.map((rm) => ({ id: rm.id, name: rm.name, unit: rm.unit }))}
          />
        </div>
      </main>
    </div>
  );
}

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { NewSaleForm } from './NewSaleForm';

export default async function NewSalePage() {
  await requirePermission('salesEntry');

  const [firms, parties, sareeTypes, homeLocations] = await Promise.all([
    prisma.firm.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.party.findMany({
      where: { isActive: true, type: { in: ['SALES', 'BOTH'] } },
      include: { branches: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    }),
    prisma.sareeType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.stockLocation.findMany({ where: { kind: 'HOME', isActive: true }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">New Sale</h1>
        <p className="mt-1 text-sm text-ink/60">Record a saree sale from Home stock and update stock.</p>

        <div className="mt-6 max-w-3xl">
          <NewSaleForm
            firms={firms.map((f) => ({ id: f.id, name: f.name }))}
            parties={parties.map((p) => ({
              id: p.id,
              name: p.name,
              branches: p.branches.map((b) => ({ id: b.id, name: b.name, address: b.address })),
            }))}
            sareeTypes={sareeTypes.map((s) => ({ id: s.id, name: s.name }))}
            homeLocations={homeLocations.map((l) => ({ id: l.id, name: l.name }))}
          />
        </div>
      </main>
    </div>
  );
}

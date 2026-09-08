import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/permissions';
import { Sidebar } from '@/components/Sidebar';
import { StockClient } from './StockClient';

export default async function StockPage() {
  const user = await requirePermission('stock');

  const [rawMaterials, balances, godowns, homes, sareeTypes] = await Promise.all([
    prisma.rawMaterial.findMany({ orderBy: { name: 'asc' } }),
    prisma.finishedStockBalance.findMany({
      where: { quantity: { gt: 0 } },
      include: { location: true, sareeType: true },
      orderBy: [{ location: { name: 'asc' } }, { sareeType: { name: 'asc' } }],
    }),
    prisma.stockLocation.findMany({ where: { kind: 'GODOWN', isActive: true }, orderBy: { name: 'asc' } }),
    prisma.stockLocation.findMany({ where: { kind: 'HOME', isActive: true }, orderBy: { name: 'asc' } }),
    prisma.sareeType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);

  // Stock valuation (v2 gap #9 — see CLAUDE.md's "v2 structural-gap
  // roadmap"). Raw material value = currentStock x latest purchase rate
  // for that material (no per-material costing table, just the most
  // recent PurchaseItem.rate — pulled as rows and reduced in JS, same
  // "no SQL GROUP BY" convention already used on /reports). Finished
  // saree value = quantity x SareeType.costPrice (manually maintained,
  // see Settings -> Saree Types) — null when not set, shown as unpriced
  // rather than assumed zero.
  const purchaseItems = rawMaterials.length
    ? await prisma.purchaseItem.findMany({
        where: { rawMaterialId: { in: rawMaterials.map((rm) => rm.id) } },
        include: { purchase: { select: { date: true } } },
        orderBy: { purchase: { date: 'desc' } },
      })
    : [];
  const latestRateByMaterial = new Map<string, number>();
  for (const item of purchaseItems) {
    if (!latestRateByMaterial.has(item.rawMaterialId)) {
      latestRateByMaterial.set(item.rawMaterialId, Number(item.rate));
    }
  }
  const costPriceBySareeType = new Map(sareeTypes.map((s) => [s.id, s.costPrice ? Number(s.costPrice) : null]));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Stock</h1>
        <p className="mt-1 text-sm text-ink/60">Raw material and finished saree stock across locations.</p>

        <div className="mt-6">
          <StockClient
            rawMaterials={rawMaterials.map((rm) => ({
              id: rm.id,
              name: rm.name,
              unit: rm.unit,
              currentStock: rm.currentStock.toString(),
              lowStockLevel: rm.lowStockLevel ? rm.lowStockLevel.toString() : null,
              latestRate: latestRateByMaterial.get(rm.id) ?? null,
            }))}
            balances={balances.map((b) => ({
              id: b.id,
              locationName: b.location.name,
              sareeTypeName: b.sareeType.name,
              state: b.state,
              quantity: b.quantity,
              costPrice: costPriceBySareeType.get(b.sareeTypeId) ?? null,
            }))}
            godowns={godowns.map((g) => ({ id: g.id, name: g.name }))}
            homes={homes.map((h) => ({ id: h.id, name: h.name }))}
            sareeTypes={sareeTypes.map((s) => ({ id: s.id, name: s.name }))}
            canTransfer={can(user, 'godownToHomeTransfer')}
            isMaster={user.role === 'MASTER'}
          />
        </div>
      </main>
    </div>
  );
}

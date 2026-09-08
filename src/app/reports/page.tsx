import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { computePartyBalances } from '@/lib/partyBalance';
import { ReportsClient } from './ReportsClient';

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

// Generalized from the original fixed last12MonthKeys() (v2 gap #12 — see
// CLAUDE.md's "v2 structural-gap roadmap") — walks month-by-month from
// `from` to `to` inclusive, however many months that spans, instead of
// always exactly 12.
function monthKeysBetween(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= end) {
    keys.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; firmId?: string };
}) {
  await requirePermission('reports');

  // Default window: last 12 months (original behavior), overridable via
  // ?from=&to=&firmId= query params. Everything derived from the
  // sales/purchases/saleItems fetches below (trend, sales-by-firm, top
  // saree types, and the new P&L section) automatically respects this
  // window since they're all computed from the same three arrays — the
  // KPI "this month vs last month" cards and the all-time snapshots
  // (stock status, weaver leaderboard, damage, receivables/payables)
  // deliberately keep their existing fixed behavior, since a custom date
  // range doesn't map cleanly onto "this calendar month" or a
  // point-in-time snapshot.
  const defaultFrom = new Date();
  defaultFrom.setMonth(defaultFrom.getMonth() - 11);
  defaultFrom.setDate(1);
  defaultFrom.setHours(0, 0, 0, 0);
  const from = searchParams.from ? new Date(searchParams.from) : defaultFrom;

  const to = searchParams.to ? new Date(searchParams.to) : new Date();
  to.setHours(23, 59, 59, 999);

  const firmId = searchParams.firmId || undefined;
  const firmWhere = firmId ? { firmId } : {};

  const startOfThisMonth = new Date();
  startOfThisMonth.setDate(1);
  startOfThisMonth.setHours(0, 0, 0, 0);
  const startOfLastMonth = new Date(startOfThisMonth);
  startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);

  const [
    sales,
    purchases,
    saleItems,
    rawMaterials,
    finishedBalances,
    damageByType,
    damageStatusCounts,
    weavers,
    partyBalances,
    inProgressWarps,
    firms,
    wageSum,
    expenseSum,
    kpiSales,
    kpiPurchases,
    godownReceipts,
  ] = await Promise.all([
    prisma.sale.findMany({
      where: { date: { gte: from, lte: to }, ...firmWhere },
      select: { date: true, totalAmount: true, firm: { select: { name: true } } },
    }),
    prisma.purchase.findMany({
      where: { date: { gte: from, lte: to }, ...firmWhere },
      select: { date: true, totalAmount: true, firm: { select: { name: true } } },
    }),
    prisma.saleItem.findMany({
      where: { sale: { date: { gte: from, lte: to }, ...firmWhere } },
      select: { quantity: true, sareeType: { select: { name: true } } },
    }),
    prisma.rawMaterial.findMany({ orderBy: { name: 'asc' } }),
    prisma.finishedStockBalance.findMany({
      where: { quantity: { gt: 0 } },
      include: { location: true },
    }),
    prisma.damageRegister.groupBy({ by: ['damageType'], _count: { _all: true } }),
    prisma.damageRegister.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.weaverProfile.findMany({
      where: { isActive: true },
      include: {
        warpAssignments: { include: { receivingEntries: true } },
        damages: { select: { id: true } },
      },
    }),
    computePartyBalances({ isActive: true }),
    prisma.warpAssignment.count({ where: { status: 'STARTED' } }),
    prisma.firm.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.weaverWage.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { date: { gte: from, lte: to }, ...firmWhere }, _sum: { amount: true } }),
    // KPI "this month" cards intentionally stay on real calendar months,
    // not the from/to filter — fetched separately, unfiltered by firm.
    prisma.sale.findMany({ where: { date: { gte: startOfLastMonth } }, select: { date: true, totalAmount: true } }),
    prisma.purchase.findMany({ where: { date: { gte: startOfLastMonth } }, select: { date: true, totalAmount: true } }),
    // Godown production: how many sarees each Godown's weavers produced,
    // per month. Godown stock stopped being a live inventory bucket (v2 —
    // receiving now credits Home directly), so this is the only place
    // "sarees per godown" is still visible — sourced from who received
    // each saree, via warpAssignment -> weaver -> assignedLocation.
    prisma.sareeReceivingEntry.findMany({
      where: { receivedAt: { gte: from, lte: to } },
      select: { receivedAt: true, warpAssignment: { select: { weaver: { select: { assignedLocation: { select: { name: true } } } } } } },
    }),
  ]);

  const monthKeys = monthKeysBetween(from, to);
  const salesByMonth = new Map(monthKeys.map((k) => [k, 0]));
  for (const s of sales) {
    const k = monthKey(s.date);
    if (salesByMonth.has(k)) salesByMonth.set(k, (salesByMonth.get(k) ?? 0) + Number(s.totalAmount));
  }
  const purchasesByMonth = new Map(monthKeys.map((k) => [k, 0]));
  for (const p of purchases) {
    const k = monthKey(p.date);
    if (purchasesByMonth.has(k)) purchasesByMonth.set(k, (purchasesByMonth.get(k) ?? 0) + Number(p.totalAmount));
  }
  const trend = monthKeys.map((k) => ({
    month: monthLabel(k),
    sales: Math.round(salesByMonth.get(k) ?? 0),
    purchases: Math.round(purchasesByMonth.get(k) ?? 0),
  }));

  const salesByFirm = new Map<string, number>();
  for (const s of sales) {
    salesByFirm.set(s.firm.name, (salesByFirm.get(s.firm.name) ?? 0) + Number(s.totalAmount));
  }
  const salesByFirmRows = Array.from(salesByFirm.entries())
    .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const qtyBySareeType = new Map<string, number>();
  for (const item of saleItems) {
    qtyBySareeType.set(item.sareeType.name, (qtyBySareeType.get(item.sareeType.name) ?? 0) + item.quantity);
  }
  const topSareeTypes = Array.from(qtyBySareeType.entries())
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);

  const stockRows = rawMaterials.map((rm) => ({
    id: rm.id,
    name: rm.name,
    category: rm.category,
    unit: rm.unit,
    currentStock: Number(rm.currentStock),
    lowStockLevel: rm.lowStockLevel ? Number(rm.lowStockLevel) : null,
    low: rm.lowStockLevel !== null && Number(rm.currentStock) <= Number(rm.lowStockLevel),
  }));

  const byLocation = new Map<string, { location: string; normal: number; damaged: number; inRepair: number }>();
  for (const b of finishedBalances) {
    const key = b.location.name;
    if (!byLocation.has(key)) byLocation.set(key, { location: key, normal: 0, damaged: 0, inRepair: 0 });
    const row = byLocation.get(key)!;
    if (b.state === 'NORMAL') row.normal += b.quantity;
    else if (b.state === 'DAMAGED') row.damaged += b.quantity;
    else row.inRepair += b.quantity;
  }
  const stockByLocation = Array.from(byLocation.values());

  // Godown x month saree-production counts, using the same monthKeys
  // window as the sales/purchase trend above.
  const godownNames = Array.from(
    new Set(godownReceipts.map((r) => r.warpAssignment.weaver.assignedLocation.name))
  ).sort();
  const godownProduction = monthKeys.map((k) => {
    const row: Record<string, string | number> = { month: monthLabel(k) };
    for (const name of godownNames) row[name] = 0;
    return row;
  });
  const godownRowByMonth = new Map(monthKeys.map((k, i) => [k, godownProduction[i]]));
  for (const r of godownReceipts) {
    const k = monthKey(r.receivedAt);
    const row = godownRowByMonth.get(k);
    if (!row) continue;
    const name = r.warpAssignment.weaver.assignedLocation.name;
    row[name] = (Number(row[name]) || 0) + 1;
  }

  const damageTypeRows = damageByType
    .map((d) => ({ type: d.damageType.replace(/_/g, ' '), count: d._count._all }))
    .sort((a, b) => b.count - a.count);
  const totalDamage = damageStatusCounts.reduce((sum, d) => sum + d._count._all, 0);
  const resolvedStatuses = new Set(['REPAIRED', 'BACK_TO_NORMAL_STOCK']);
  const resolvedCount = damageStatusCounts
    .filter((d) => resolvedStatuses.has(d.status))
    .reduce((sum, d) => sum + d._count._all, 0);
  const nonRepairableCount = damageStatusCounts.find((d) => d.status === 'NON_REPAIRABLE')?._count._all ?? 0;
  const openCount = totalDamage - resolvedCount - nonRepairableCount;

  const weaverRows = weavers
    .map((w) => {
      const totalSarees = w.warpAssignments.reduce((sum, a) => sum + a.receivingEntries.length, 0);
      const completedWarps = w.warpAssignments.filter((a) => a.status === 'COMPLETED').length;
      const damageCount = w.damages.length;
      const totalHandled = totalSarees + damageCount;
      const damageRate = totalHandled > 0 ? (damageCount / totalHandled) * 100 : 0;
      return { id: w.id, name: w.name, totalSarees, completedWarps, damageCount, damageRate };
    })
    .filter((w) => w.totalSarees > 0 || w.completedWarps > 0)
    .sort((a, b) => b.totalSarees - a.totalSarees)
    .slice(0, 10);

  const receivables = partyBalances
    .filter((p) => p.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);
  const payables = partyBalances
    .filter((p) => p.balance < 0)
    .sort((a, b) => a.balance - b.balance)
    .slice(0, 5);

  const kpis = {
    salesThisMonth: kpiSales.filter((s) => s.date >= startOfThisMonth).reduce((sum, s) => sum + Number(s.totalAmount), 0),
    salesLastMonth: kpiSales
      .filter((s) => s.date >= startOfLastMonth && s.date < startOfThisMonth)
      .reduce((sum, s) => sum + Number(s.totalAmount), 0),
    purchasesThisMonth: kpiPurchases
      .filter((p) => p.date >= startOfThisMonth)
      .reduce((sum, p) => sum + Number(p.totalAmount), 0),
    purchasesLastMonth: kpiPurchases
      .filter((p) => p.date >= startOfLastMonth && p.date < startOfThisMonth)
      .reduce((sum, p) => sum + Number(p.totalAmount), 0),
    totalReceivable: partyBalances.filter((p) => p.balance > 0).reduce((sum, p) => sum + p.balance, 0),
    totalPayable: Math.abs(partyBalances.filter((p) => p.balance < 0).reduce((sum, p) => sum + p.balance, 0)),
    openDamage: openCount,
    lowStockCount: stockRows.filter((r) => r.low).length,
    inProgressWarps,
  };

  // Simplified P&L (v2 gap #8) — cash-basis, not full accrual/COGS
  // costing. Scoped to the same from/to/firmId filter as the trend chart
  // above (Wages have no firm concept, so firmId doesn't apply there).
  const salesTotal = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
  const purchasesTotal = purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0);
  const wagesTotal = Number(wageSum._sum.amount ?? 0);
  const expensesTotal = Number(expenseSum._sum.amount ?? 0);
  const pnl = {
    sales: Math.round(salesTotal),
    purchases: Math.round(purchasesTotal),
    wages: Math.round(wagesTotal),
    expenses: Math.round(expensesTotal),
    netMargin: Math.round(salesTotal - purchasesTotal - wagesTotal - expensesTotal),
  };

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Reports</h1>
        <p className="mt-1 text-sm text-ink/60">
          Sales & purchase trends, P&amp;L, current stock and damage snapshot, and weaver/party leaderboards.
        </p>

        <div className="mt-6">
          <ReportsClient
            kpis={kpis}
            trend={trend}
            salesByFirm={salesByFirmRows}
            topSareeTypes={topSareeTypes}
            stockRows={stockRows}
            stockByLocation={stockByLocation}
            godownProduction={godownProduction}
            godownNames={godownNames}
            damageTypeRows={damageTypeRows}
            damageStatus={{ total: totalDamage, open: openCount, resolved: resolvedCount, nonRepairable: nonRepairableCount }}
            weaverRows={weaverRows}
            receivables={receivables}
            payables={payables}
            pnl={pnl}
            firms={firms.map((f) => ({ id: f.id, name: f.name }))}
            filters={{ from: from.toISOString().slice(0, 10), to: searchParams.to ?? new Date().toISOString().slice(0, 10), firmId: firmId ?? '' }}
          />
        </div>
      </main>
    </div>
  );
}

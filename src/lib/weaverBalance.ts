import { prisma } from '@/lib/prisma';

export type WeaverBalanceRow = { id: string; name: string; balance: number };

// Net amount owed TO a weaver (positive) or advanced to them beyond what
// they've earned so far (negative) — sum of signed WeaverLedgerEntry
// amounts. Bulk groupBy version for a weaver list; the per-weaver detail
// page walks the same entries chronologically for a running-balance table
// (WeaverLedgerEntry is already the raw ledger, unlike Party's balance
// which synthesizes rows from five different tables — no equivalent
// synthesis needed here).
export async function computeWeaverBalances(weaverIds?: string[]): Promise<WeaverBalanceRow[]> {
  const weavers = await prisma.weaverProfile.findMany({
    where: weaverIds ? { id: { in: weaverIds } } : undefined,
    orderBy: { name: 'asc' },
  });
  const sums = await prisma.weaverLedgerEntry.groupBy({
    by: ['weaverId'],
    _sum: { amount: true },
  });
  const balanceByWeaver = new Map(sums.map((s) => [s.weaverId, Number(s._sum.amount ?? 0)]));

  return weavers.map((w) => ({ id: w.id, name: w.name, balance: balanceByWeaver.get(w.id) ?? 0 }));
}

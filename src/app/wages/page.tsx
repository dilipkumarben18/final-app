import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { computeWeaverBalances } from '@/lib/weaverBalance';
import { WagesClient } from './WagesClient';

export default async function WagesPage() {
  await requirePermission('weaverWages');

  const [weavers, completedUnpaidWarps, recentWages, recentPayments] = await Promise.all([
    prisma.weaverProfile.findMany({
      where: { isActive: true },
      include: { sareeTypes: { include: { sareeType: true } } },
      orderBy: { name: 'asc' },
    }),
    // A full warp is 24 sarees — completedAt marks the 24th actually cut &
    // received, i.e. the point at which a full-warp wage becomes payable.
    // wage: null is the "not yet paid for" filter (WeaverWage.warpAssignmentId
    // is unique, so at most one wage can ever exist per warp).
    prisma.warpAssignment.findMany({
      where: { status: 'COMPLETED', wage: null },
      include: { weaver: true, sareeType: true },
      orderBy: { completedAt: 'asc' },
    }),
    prisma.weaverWage.findMany({
      include: { weaver: true, sareeType: true },
      orderBy: { date: 'desc' },
      take: 20,
    }),
    prisma.weaverPayment.findMany({
      include: { weaver: true },
      orderBy: { date: 'desc' },
      take: 20,
    }),
  ]);

  const balances = await computeWeaverBalances(weavers.map((w) => w.id));
  const balanceByWeaver = new Map(balances.map((b) => [b.id, b.balance]));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Weaver Wages &amp; Advances</h1>
        <p className="mt-1 text-sm text-ink/60">
          Pay weavers by the saree — set a rate once and it's remembered next time. A weaver's
          balance below zero means they've been paid more than they've earned so far (an advance).
        </p>

        <div className="mt-6">
          <WagesClient
            weavers={weavers.map((w) => ({
              id: w.id,
              name: w.name,
              balance: balanceByWeaver.get(w.id) ?? 0,
              sareeTypes: w.sareeTypes.map((st) => ({
                id: st.sareeType.id,
                name: st.sareeType.name,
                ratePerSaree: st.ratePerSaree?.toString() ?? '',
              })),
            }))}
            completedUnpaidWarps={completedUnpaidWarps.map((w) => ({
              id: w.id,
              weaverId: w.weaverId,
              weaverName: w.weaver.name,
              sareeTypeId: w.sareeTypeId,
              sareeTypeName: w.sareeType.name,
              completedAt: w.completedAt!.toISOString(),
            }))}
            recentWages={recentWages.map((w) => ({
              id: w.id,
              weaverName: w.weaver.name,
              sareeTypeName: w.sareeType?.name ?? null,
              quantity: w.quantity,
              rate: w.rate.toString(),
              amount: w.amount.toString(),
              date: w.date.toISOString(),
              isFullWarp: !!w.warpAssignmentId,
            }))}
            recentPayments={recentPayments.map((p) => ({
              id: p.id,
              weaverName: p.weaver.name,
              amount: p.amount.toString(),
              date: p.date.toISOString(),
              method: p.method,
            }))}
          />
        </div>
      </main>
    </div>
  );
}

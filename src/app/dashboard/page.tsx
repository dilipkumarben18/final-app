import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';

export default async function DashboardPage() {
  const user = await requireUser();

  const [lowStockCount, warpsInProgress, homeStockTotal, openDamages] = await Promise.all([
    prisma.rawMaterial.count({
      where: { lowStockLevel: { not: null } },
    }),
    prisma.warpAssignment.count({
      where: { status: 'STARTED' },
    }),
    prisma.finishedStockBalance.aggregate({
      _sum: { quantity: true },
      where: { location: { kind: 'HOME' }, state: 'NORMAL' },
    }),
    prisma.damageRegister.count({
      where: { status: { notIn: ['BACK_TO_NORMAL_STOCK', 'NON_REPAIRABLE'] } },
    }),
  ]);

  const cards = [
    { label: 'Raw materials tracked for low stock', value: lowStockCount },
    { label: 'Warps in progress', value: warpsInProgress },
    { label: 'Home ready-to-sale stock', value: homeStockTotal._sum.quantity ?? 0 },
    { label: 'Open damage/repair entries', value: openDamages },
  ];

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Welcome, {user.name}
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Here&apos;s where things stand across the business today.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm"
            >
              <p className="text-3xl font-semibold text-brand-700">{c.value}</p>
              <p className="mt-1 text-sm text-ink/60">{c.label}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

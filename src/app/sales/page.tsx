import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { SalesClient } from './SalesClient';

export default async function SalesPage() {
  await requirePermission('salesEntry');

  const [sales, homeLocations, firms] = await Promise.all([
    prisma.sale.findMany({
      orderBy: { date: 'desc' },
      include: {
        firm: true,
        party: true,
        returns: true,
        items: { include: { sareeType: true, returnItems: true } },
      },
    }),
    prisma.stockLocation.findMany({
      where: { kind: 'HOME', isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.firm.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  const serialized = sales.map((s) => ({
    id: s.id,
    saleNumber: s.saleNumber,
    invoiceNumber: s.invoiceNumber,
    firmName: s.firm.name,
    partyId: s.partyId,
    partyName: s.party.name,
    isOpeningEntry: s.isOpeningEntry,
    date: s.date.toISOString(),
    gstAmount: s.gstAmount.toString(),
    totalAmount: s.totalAmount.toString(),
    returnedAmount: s.returns.reduce((sum, r) => sum + Number(r.amount), 0).toFixed(2),
    items: s.items.map((it) => ({
      id: it.id,
      sareeTypeName: it.sareeType.name,
      quantity: it.quantity,
      remaining: it.quantity - it.returnItems.reduce((sum, r) => sum + r.quantity, 0),
    })),
  }));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">Sales</h1>
            <p className="mt-1 text-sm text-ink/60">Saree sales entries across all firms, from Home stock only.</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/sales/bulk-import"
              className="flex items-center gap-1.5 rounded-lg border border-brand-100 px-4 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
            >
              <Upload size={16} /> Bulk import
            </Link>
            <Link
              href="/sales/new"
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              <Plus size={16} /> New sale
            </Link>
          </div>
        </div>

        <div className="mt-6">
          <SalesClient sales={serialized} homeLocations={homeLocations} firms={firms} />
        </div>
      </main>
    </div>
  );
}

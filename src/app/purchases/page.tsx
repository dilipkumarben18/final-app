import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { PurchasesClient } from './PurchasesClient';

export default async function PurchasesPage() {
  await requirePermission('purchaseEntry');

  const [purchases, firms] = await Promise.all([
    prisma.purchase.findMany({
      orderBy: { date: 'desc' },
      include: { firm: true, party: true, returns: true, items: { include: { rawMaterial: true, sareeType: true } } },
    }),
    prisma.firm.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  const serialized = purchases.map((p) => ({
    id: p.id,
    purchaseNumber: p.purchaseNumber,
    purchaseType: p.purchaseType,
    invoiceNumber: p.invoiceNumber,
    firmName: p.firm.name,
    partyId: p.partyId,
    partyName: p.party.name,
    date: p.date.toISOString(),
    gstAmount: p.gstAmount.toString(),
    totalAmount: p.totalAmount.toString(),
    returnedAmount: p.returns.reduce((sum, r) => sum + Number(r.amount), 0).toFixed(2),
    items: p.items.map((it) => ({
      rawMaterialId: it.rawMaterialId ?? '',
      rawMaterialName: it.rawMaterial?.name ?? it.sareeType?.name ?? 'Unknown',
    })),
  }));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">Purchases</h1>
            <p className="mt-1 text-sm text-ink/60">Raw material purchase entries across all firms.</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/purchases/bulk-import"
              className="flex items-center gap-1.5 rounded-lg border border-brand-100 px-4 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
            >
              <Upload size={16} /> Bulk import
            </Link>
            <Link
              href="/purchases/new"
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              <Plus size={16} /> New purchase
            </Link>
          </div>
        </div>

        <div className="mt-6">
          <PurchasesClient purchases={serialized} firms={firms} />
        </div>
      </main>
    </div>
  );
}

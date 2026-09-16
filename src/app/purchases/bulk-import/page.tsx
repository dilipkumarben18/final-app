import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { BulkImportPurchasesClient } from './BulkImportPurchasesClient';

export default async function BulkImportPurchasesPage() {
  await requirePermission('purchaseEntry');

  const [firms, rawMaterials, sareeTypes] = await Promise.all([
    prisma.firm.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.rawMaterial.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, category: true, unit: true } }),
    prisma.sareeType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Bulk Import Purchases</h1>
        <p className="mt-1 text-sm text-ink/60">
          Import historical purchase bills from a CSV — e.g. from a bulk bill-print PDF. Imported
          purchases are marked as historical records: they keep the GST/party ledger trail but
          never change current raw-material or saree stock.
        </p>

        <div className="mt-6">
          <BulkImportPurchasesClient firms={firms} rawMaterials={rawMaterials} sareeTypes={sareeTypes} />
        </div>
      </main>
    </div>
  );
}

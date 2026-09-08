import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { BulkImportSalesClient } from './BulkImportSalesClient';

export default async function BulkImportSalesPage() {
  await requirePermission('salesEntry');

  const firms = await prisma.firm.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Bulk Import Sales</h1>
        <p className="mt-1 text-sm text-ink/60">
          Import historical sale bills from a CSV. Imported sales are marked as historical
          records — they keep the GST/party ledger trail but never change current Home stock.
        </p>

        <div className="mt-6">
          <BulkImportSalesClient firms={firms} />
        </div>
      </main>
    </div>
  );
}

import Link from 'next/link';
import { Upload } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { PartiesClient } from './PartiesClient';
import { can } from '@/lib/permissions';

export default async function PartiesPage() {
  const user = await requirePermission('partyMaster');

  const parties = await prisma.party.findMany({
    include: { branches: { orderBy: { name: 'asc' } } },
    orderBy: { name: 'asc' },
  });

  const serialized = parties.map((p) => ({
    ...p,
    openingBalance: p.openingBalance.toString(),
    creditLimit: p.creditLimit ? p.creditLimit.toString() : null,
  }));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">Party Master</h1>
            <p className="mt-1 text-sm text-ink/60">
              Suppliers and customers used across Purchase and Sales entry.
            </p>
          </div>
          {can(user, 'partyMaster') && (
            <Link
              href="/parties/bulk-import"
              className="flex items-center gap-1.5 rounded-lg border border-brand-100 px-4 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
            >
              <Upload size={16} /> Bulk import
            </Link>
          )}
        </div>

        <div className="mt-6">
          <PartiesClient parties={serialized} canEdit={can(user, 'partyMaster')} />
        </div>
      </main>
    </div>
  );
}

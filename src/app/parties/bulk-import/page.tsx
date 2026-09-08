import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { BulkImportPartiesClient } from './BulkImportPartiesClient';

export default async function BulkImportPartiesPage() {
  await requirePermission('partyMaster');

  // Passed down so the client can flag likely duplicates in the preview
  // before the user even hits Import — the server action re-checks
  // authoritatively at import time regardless, this is just a head start.
  const existing = await prisma.party.findMany({
    select: { name: true, gstNumber: true },
  });

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Bulk Import Parties</h1>
        <p className="mt-1 text-sm text-ink/60">
          Upload a CSV of suppliers/customers — useful when bringing in a party list from another
          system or a bulk bill export.
        </p>

        <div className="mt-6">
          <BulkImportPartiesClient existing={existing} />
        </div>
      </main>
    </div>
  );
}

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { SareeBookClient } from './SareeBookClient';

export default async function SareeBookPage() {
  await requirePermission('sareeReceiving');

  const entries = await prisma.sareeReceivingEntry.findMany({
    include: { warpAssignment: { include: { weaver: true, sareeType: true } } },
    orderBy: { receivedAt: 'desc' },
    take: 150,
  });

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Saree Book</h1>
        <p className="mt-1 text-sm text-ink/60">
          Every saree received, one row each — serial number, weight, design, colours, and photos.
        </p>

        <div className="mt-6">
          <SareeBookClient
            entries={entries.map((e) => ({
              id: e.id,
              serialNumber: e.serialNumber,
              sareeNumber: e.sareeNumber,
              weaverName: e.warpAssignment.weaver.name,
              sareeTypeName: e.warpAssignment.sareeType.name,
              weightGram: e.weightGram ? e.weightGram.toString() : null,
              designName: e.designName,
              warpColour: e.warpColour,
              weftColour: e.weftColour,
              jariColour: e.jariColour,
              status: e.status,
              photoUrls: e.photoUrls,
              receivedAt: e.receivedAt.toISOString(),
            }))}
          />
        </div>
      </main>
    </div>
  );
}

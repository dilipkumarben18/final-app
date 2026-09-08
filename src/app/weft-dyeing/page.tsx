import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { WeftDyeingClient } from './WeftDyeingClient';

export default async function WeftDyeingPage() {
  await requirePermission('production');

  const [pending, recentReceived, colourOptions] = await Promise.all([
    prisma.weftDyeingBatch.findMany({ where: { status: 'SENT' }, orderBy: { sentDate: 'asc' } }),
    prisma.weftDyeingBatch.findMany({ where: { status: 'RECEIVED' }, orderBy: { receivedDate: 'desc' }, take: 20 }),
    prisma.rawMaterial.findMany({ where: { category: 'WEFT' }, orderBy: { name: 'asc' }, select: { name: true } }),
  ]);

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Weft Dyeing</h1>
        <p className="mt-1 text-sm text-ink/60">
          Send plain weft yarn out by colour and weight; receiving it back adds that weight to the
          colour's stock, ready for Material Issue.
        </p>

        <div className="mt-6">
          <WeftDyeingClient
            colourOptions={colourOptions.map((c) => c.name)}
            pending={pending.map((b) => ({
              id: b.id,
              colourName: b.colourName,
              sentWeightKg: b.sentWeightKg.toString(),
              sentDate: b.sentDate.toISOString(),
            }))}
            recentReceived={recentReceived.map((b) => ({
              id: b.id,
              colourName: b.colourName,
              sentWeightKg: b.sentWeightKg.toString(),
              receivedWeightKg: b.receivedWeightKg!.toString(),
              receivedDate: b.receivedDate!.toISOString(),
            }))}
          />
        </div>
      </main>
    </div>
  );
}

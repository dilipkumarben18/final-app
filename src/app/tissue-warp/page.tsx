import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { TissueWarpClient } from './TissueWarpClient';

export default async function TissueWarpPage() {
  await requirePermission('production');

  const [marcsOptions, recentWarps, recentPate] = await Promise.all([
    prisma.rawMaterial.findMany({ where: { category: 'JARI' }, orderBy: { name: 'asc' }, select: { id: true, name: true, unit: true, currentStock: true } }),
    prisma.dyeingBatchWarp.findMany({
      where: { dyeingBatch: { rawMaterial: { category: 'JARI' } } },
      include: { dyeingBatch: { include: { rawMaterial: true } }, warpAssignment: { include: { weaver: true } } },
      orderBy: { receivedAt: 'desc' },
      take: 20,
    }),
    prisma.pateRoll.findMany({ include: { rawMaterial: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Tissue Warp &amp; Pate</h1>
        <p className="mt-1 text-sm text-ink/60">
          Tissue sarees weave from a Jari-Marcs warp rather than Silk — usually 30-40 sarees per
          roller, not 24. Making a roller here uses up Jari Marcs stock immediately; the roller then
          shows up in Warp Alerts to assign to a tissue weaver like any other warp.
        </p>

        <div className="mt-6">
          <TissueWarpClient
            marcsOptions={marcsOptions.map((m) => ({ id: m.id, name: m.name, unit: m.unit, currentStock: m.currentStock.toString() }))}
            recentWarps={recentWarps.map((w) => ({
              id: w.id,
              reference: w.dyeingBatch.reference,
              materialName: w.dyeingBatch.rawMaterial.name,
              capacity: w.capacity,
              receivedAt: w.receivedAt!.toISOString(),
              weaverName: w.warpAssignment?.weaver.name ?? null,
            }))}
            recentPate={recentPate.map((p) => ({
              id: p.id,
              reference: p.reference,
              materialName: p.rawMaterial.name,
              weightUsedKg: p.weightUsedKg.toString(),
              createdAt: p.createdAt.toISOString(),
            }))}
          />
        </div>
      </main>
    </div>
  );
}

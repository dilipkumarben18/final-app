import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { DyeingClient } from './DyeingClient';

export default async function ProductionPage() {
  await requirePermission('production');

  const [warpMaterials, batches, availableWarps, dyeingParties] = await Promise.all([
    prisma.rawMaterial.findMany({ where: { category: 'WARP' }, orderBy: { name: 'asc' } }),
    prisma.dyeingBatch.findMany({
      include: { rawMaterial: true, party: true, warps: { include: { shadeLines: true }, orderBy: { warpIndex: 'asc' } } },
      orderBy: { sentDate: 'desc' },
      take: 100,
    }),
    // "Available" = physically received but not yet handed to a weaver
    // whole (see assignWarp in warpAssignments.ts) — each row here is one
    // real physical warp, whatever mix of shades it happens to contain.
    prisma.dyeingBatchWarp.findMany({
      where: { receivedAt: { not: null }, warpAssignment: null },
      include: { shadeLines: true, dyeingBatch: { select: { reference: true } } },
      orderBy: { receivedAt: 'asc' },
    }),
    prisma.party.findMany({ where: { type: 'DYEING', isActive: true }, orderBy: { name: 'asc' } }),
  ]);

  const serializedBatches = batches.map((b) => ({
    id: b.id,
    reference: b.reference,
    rawMaterialName: b.rawMaterial.name,
    warpCount: b.warpCount,
    sentDate: b.sentDate.toISOString(),
    status: b.status,
    remarks: b.remarks,
    partyName: b.party?.name ?? null,
    charges: b.charges ? b.charges.toString() : null,
    expectedReturnDate: b.expectedReturnDate ? b.expectedReturnDate.toISOString() : null,
    warps: b.warps.map((w) => ({
      id: w.id,
      warpIndex: w.warpIndex,
      receivedAt: w.receivedAt ? w.receivedAt.toISOString() : null,
      shadeLines: w.shadeLines.map((s) => ({
        id: s.id,
        shadeNumber: s.shadeNumber,
        sentQuantity: s.sentQuantity,
        receivedQuantity: s.receivedQuantity,
      })),
    })),
  }));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Warp Dyeing</h1>
        <p className="mt-1 text-sm text-ink/60">
          Send raw warp for dyeing, receive it back by shade, and track dyed warp stock.
        </p>

        <div className="mt-6">
          <DyeingClient
            warpMaterials={warpMaterials.map((m) => ({ id: m.id, name: m.name, currentStock: m.currentStock.toString() }))}
            batches={serializedBatches}
            availableWarps={availableWarps.map((w) => ({
              id: w.id,
              batchReference: w.dyeingBatch.reference,
              warpIndex: w.warpIndex,
              receivedAt: w.receivedAt!.toISOString(),
              shadeLines: w.shadeLines.map((l) => ({ id: l.id, shadeNumber: l.shadeNumber, receivedQuantity: l.receivedQuantity ?? 0 })),
            }))}
            dyeingParties={dyeingParties.map((p) => ({ id: p.id, name: p.name }))}
          />
        </div>
      </main>
    </div>
  );
}

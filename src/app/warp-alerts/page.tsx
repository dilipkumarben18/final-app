import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { WarpAlertsClient } from './WarpAlertsClient';

export default async function WarpAlertsPage() {
  await requirePermission('warpAlerts');

  const [weavers, availableWarps] = await Promise.all([
    prisma.weaverProfile.findMany({
      where: { isActive: true },
      include: {
        sareeTypes: { include: { sareeType: true } },
        warpAssignments: {
          where: { status: { in: ['STARTED', 'ASSIGNED', 'WAITING_TO_START'] } },
          include: {
            sareeType: true,
            receivingEntries: true,
            nextAssignment: { select: { id: true, status: true } },
            dyeingBatchWarp: {
              select: { capacity: true, dyeingBatch: { select: { rawMaterial: { select: { category: true } } } } },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    // Same "received but not yet handed to a weaver" set as /production —
    // the option list for the Assign Warp modal below.
    prisma.dyeingBatchWarp.findMany({
      where: { receivedAt: { not: null }, warpAssignment: null },
      include: {
        shadeLines: true,
        dyeingBatch: { select: { reference: true, rawMaterial: { select: { category: true } } } },
      },
      orderBy: { receivedAt: 'asc' },
    }),
  ]);

  const sareeTypes = await prisma.sareeType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });

  const serializedWeavers = weavers.map((w) => {
    // A weaver can briefly have two STARTED assignments during a
    // changeover: the old one awaiting cut (twentyFourthWovenAt set) and
    // the new one already active. "current" (for the 18/24 alert) is
    // specifically the active one, not whichever STARTED row comes first.
    const active = w.warpAssignments.find((a) => a.status === 'STARTED' && !a.twentyFourthWovenAt);
    const awaitingCut = w.warpAssignments.find(
      (a) => a.status === 'STARTED' && a.twentyFourthWovenAt && !a.completedAt
    );
    const pending = w.warpAssignments.find((a) => a.status === 'ASSIGNED' || a.status === 'WAITING_TO_START');
    const activeCapacity = active?.dyeingBatchWarp?.capacity ?? 24;
    const isTissue = active?.dyeingBatchWarp?.dyeingBatch.rawMaterial.category === 'JARI';
    return {
      id: w.id,
      name: w.name,
      sareeTypeIds: w.sareeTypes.map((s) => s.sareeType.id),
      current: active
        ? {
            id: active.id,
            sareeTypeName: active.sareeType.name,
            receivedCount: active.receivingEntries.filter((e) => e.sareeNumber <= activeCapacity - 1).length,
            capacity: activeCapacity,
            // Tissue (Jari) warps run 30-40 sarees, much longer than
            // Silk's 24 — alerting at "6 remaining" (Silk's threshold)
            // would fire far too late on a 40-saree warp, so Tissue gets
            // its own "10 remaining" threshold instead.
            alertAtRemaining: isTissue ? 10 : 6,
          }
        : null,
      awaitingCut: awaitingCut
        ? { sareeTypeName: awaitingCut.sareeType.name, capacity: awaitingCut.dyeingBatchWarp?.capacity ?? 24 }
        : null,
      pending: pending
        ? { id: pending.id, sareeTypeName: pending.sareeType.name, status: pending.status as 'ASSIGNED' | 'WAITING_TO_START' }
        : null,
    };
  });

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Warp Alerts &amp; Assignment</h1>
        <p className="mt-1 text-sm text-ink/60">
          Current warp progress per weaver. Alerts fire 6 sarees before the end on Silk warps, 10 before
          the end on Tissue (Jari) warps — prepare the next warp ahead of time.
        </p>

        <div className="mt-6">
          <WarpAlertsClient
            weavers={serializedWeavers}
            sareeTypes={sareeTypes.map((s) => ({ id: s.id, name: s.name }))}
            availableWarps={availableWarps.map((w) => ({
              id: w.id,
              label: `${w.dyeingBatch.reference} · Warp ${w.warpIndex} — ${w.capacity} sarees (received ${w.receivedAt!.toLocaleDateString()})`,
              shadeLines: w.shadeLines
                .slice()
                .sort((a, b) => (a.order || 999) - (b.order || 999))
                .map((l) => ({ id: l.id, shadeNumber: l.shadeNumber || 'Shade TBD', quantity: l.receivedQuantity ?? 0 })),
            }))}
          />
        </div>
      </main>
    </div>
  );
}

import { prisma } from '@/lib/prisma';
import { requireMaster } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { ProductionBatchesClient } from './ProductionBatchesClient';

function computeChecklist(
  batch: {
    warpAssignments: { status: string }[];
    materialIssues: { weftIssuedGrams: unknown; jariIssued: unknown }[];
    wages: { id: string; amount: unknown }[];
  },
  paidByWageId: Map<string, number>
): string[] {
  const warnings: string[] = [];
  if (batch.warpAssignments.length === 0) warnings.push('No warp assigned to this Purai yet.');

  const hasWeft = batch.materialIssues.some((m) => Number(m.weftIssuedGrams) > 0);
  const hasJari = batch.materialIssues.some((m) => Number(m.jariIssued) > 0);
  if (!hasWeft) warnings.push('No Weft issued for this Purai yet.');
  if (!hasJari) warnings.push('No Jari issued for this Purai yet.');

  const pendingWarps = batch.warpAssignments.filter((a) => a.status !== 'COMPLETED');
  if (pendingWarps.length > 0) {
    warnings.push(`${pendingWarps.length} warp(s) in this Purai not yet fully received.`);
  }

  if (batch.wages.length === 0) {
    warnings.push('No wages entered for this Purai yet.');
  } else {
    const wageTotal = batch.wages.reduce((sum, w) => sum + Number(w.amount), 0);
    const paidTotal = batch.wages.reduce((sum, w) => sum + (paidByWageId.get(w.id) ?? 0), 0);
    const pending = wageTotal - paidTotal;
    if (pending > 0.01) {
      warnings.push(`₹${pending.toLocaleString('en-IN', { maximumFractionDigits: 2 })} labour still pending payment.`);
    }
  }

  return warnings;
}

export default async function ProductionBatchesPage({ searchParams }: { searchParams: { weaverId?: string } }) {
  await requireMaster();

  const weavers = await prisma.weaverProfile.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const weaverId = searchParams.weaverId || weavers[0]?.id;

  if (!weaverId) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">
          <h1 className="font-display text-2xl font-semibold text-ink">Production Batches</h1>
          <p className="mt-2 text-sm text-ink/60">No active weavers yet — add one in Settings → Weavers first.</p>
        </main>
      </div>
    );
  }

  const weaver = await prisma.weaverProfile.findUniqueOrThrow({ where: { id: weaverId } });

  const [batches, untaggedWarps, untaggedIssues, untaggedWages] = await Promise.all([
    prisma.productionBatch.findMany({
      where: { weaverId },
      include: {
        warpAssignments: { include: { sareeType: true } },
        materialIssues: true,
        wages: { include: { sareeType: true } },
      },
      orderBy: { batchNumber: 'desc' },
    }),
    prisma.warpAssignment.findMany({
      where: { weaverId, productionBatchId: null },
      include: { sareeType: true },
      orderBy: { assignmentDate: 'desc' },
    }),
    prisma.materialIssue.findMany({
      where: { weaverId, productionBatchId: null },
      orderBy: { date: 'desc' },
    }),
    prisma.weaverWage.findMany({
      where: { weaverId, productionBatchId: null },
      orderBy: { date: 'desc' },
    }),
  ]);

  const allWageIds = batches.flatMap((b) => b.wages.map((w) => w.id));
  const payments = allWageIds.length
    ? await prisma.weaverPayment.findMany({ where: { weaverWageId: { in: allWageIds } } })
    : [];
  const paidByWageId = new Map<string, number>();
  for (const p of payments) {
    if (!p.weaverWageId) continue;
    paidByWageId.set(p.weaverWageId, (paidByWageId.get(p.weaverWageId) ?? 0) + Number(p.amount));
  }

  const serializedBatches = batches.map((b) => ({
    id: b.id,
    batchNumber: b.batchNumber,
    status: b.status,
    date: b.date.toISOString(),
    notes: b.notes,
    warpAssignments: b.warpAssignments.map((a) => ({
      id: a.id,
      sareeTypeName: a.sareeType.name,
      status: a.status,
      assignmentDate: a.assignmentDate.toISOString(),
    })),
    materialIssues: b.materialIssues.map((m) => ({
      id: m.id,
      date: m.date.toISOString(),
      sareeCount: m.sareeCount,
      weftIssuedGrams: m.weftIssuedGrams.toString(),
      jariIssued: m.jariIssued.toString(),
    })),
    wages: b.wages.map((w) => ({
      id: w.id,
      date: w.date.toISOString(),
      sareeTypeName: w.sareeType?.name ?? null,
      quantity: w.quantity,
      rate: w.rate.toString(),
      amount: w.amount.toString(),
      paid: paidByWageId.get(w.id) ?? 0,
    })),
    checklist: computeChecklist(b, paidByWageId),
  }));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Production Batches (Purai)</h1>
        <p className="mt-1 text-sm text-ink/60">
          Group a weaver's warp, material, and wage activity into numbered batches — purely a grouping layer, doesn't
          change how those records work on their own pages.
        </p>

        <div className="mt-6">
          <ProductionBatchesClient
            weavers={weavers.map((w) => ({ id: w.id, name: w.name }))}
            selectedWeaverId={weaver.id}
            batches={serializedBatches}
            untaggedWarpAssignments={untaggedWarps.map((a) => ({
              id: a.id,
              label: `${a.sareeType.name} — assigned ${new Date(a.assignmentDate).toLocaleDateString()} (${a.status.replace(/_/g, ' ').toLowerCase()})`,
            }))}
            untaggedMaterialIssues={untaggedIssues.map((m) => ({
              id: m.id,
              label: `${new Date(m.date).toLocaleDateString()} — ${m.sareeCount} sarees, Weft ${m.weftIssuedGrams}g, Jari ${m.jariIssued}`,
            }))}
            untaggedWages={untaggedWages.map((w) => ({
              id: w.id,
              label: `${new Date(w.date).toLocaleDateString()} — ${w.quantity} × ₹${Number(w.rate).toLocaleString('en-IN')} (₹${Number(w.amount).toLocaleString('en-IN')})`,
            }))}
          />
        </div>
      </main>
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { WeaverLedgerClient, type WeaverLedgerRow } from './WeaverLedgerClient';

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000);
}

function fmtDays(d: number): string {
  return d < 1 ? `${Math.round(d * 24)}h` : `${d.toFixed(1)}d`;
}

export default async function WeaverDetailPage({ params }: { params: { id: string } }) {
  const weaver = await prisma.weaverProfile.findUnique({
    where: { id: params.id },
    include: {
      assignedLocation: true,
      sareeTypes: { include: { sareeType: true } },
      warpAssignments: {
        include: {
          sareeType: true,
          receivingEntries: true,
          materialIssues: true,
          previousAssignment: { select: { twentyFourthWovenAt: true } },
        },
        orderBy: { assignmentDate: 'desc' },
      },
    },
  });

  if (!weaver) notFound();

  const [damageCount, ledgerEntries, sareeTypes, wages] = await Promise.all([
    prisma.damageRegister.count({ where: { weaverId: weaver.id } }),
    prisma.weaverLedgerEntry.findMany({ where: { weaverId: weaver.id }, orderBy: { date: 'asc' } }),
    prisma.sareeType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.weaverWage.findMany({ where: { weaverId: weaver.id }, orderBy: { date: 'desc' }, take: 30 }),
  ]);

  const typeLabels: Record<string, string> = {
    MATERIAL_ISSUED: 'Material Issued',
    WAGES_EARNED: 'Wages',
    PAYMENT_MADE: 'Payment',
    ADJUSTMENT: 'Adjustment',
  };
  let runningBalance = 0;
  const ledgerRows: WeaverLedgerRow[] = ledgerEntries.map((entry) => {
    runningBalance += Number(entry.amount);
    return {
      date: entry.date.toISOString(),
      type: typeLabels[entry.type] ?? entry.type,
      label: entry.notes ?? '—',
      amount: Number(entry.amount),
      balance: runningBalance,
    };
  });

  const wageOptions = wages.map((w) => ({
    id: w.id,
    label: `${new Date(w.date).toLocaleDateString()} — ${w.quantity} × ₹${Number(w.rate).toLocaleString('en-IN')} (₹${Number(w.amount).toLocaleString('en-IN')})`,
  }));

  const assignments = weaver.warpAssignments;
  const completed = assignments.filter((a) => a.status === 'COMPLETED' && a.warpStartDate && a.completedAt);

  const totalCompletedWarps = completed.length;
  const totalSarees = assignments.reduce((sum, a) => sum + a.receivingEntries.length, 0);

  const completionDurations = completed.map((a) => daysBetween(a.warpStartDate!, a.completedAt!));
  const avgWarpCompletionDays =
    completionDurations.length > 0
      ? completionDurations.reduce((sum, d) => sum + d, 0) / completionDurations.length
      : null;

  const sareesPerDayRates = completed
    .map((a) => {
      const days = daysBetween(a.warpStartDate!, a.completedAt!);
      return days > 0 ? a.receivingEntries.length / days : null;
    })
    .filter((v): v is number => v !== null);
  const avgSareesPerDay =
    sareesPerDayRates.length > 0 ? sareesPerDayRates.reduce((sum, v) => sum + v, 0) / sareesPerDayRates.length : null;

  const totalHandled = totalSarees + damageCount;
  const damageRate = totalHandled > 0 ? (damageCount / totalHandled) * 100 : null;

  const changeovers = assignments
    .filter((a) => a.warpStartDate && a.previousAssignment?.twentyFourthWovenAt)
    .map((a) => ({
      id: a.id,
      sareeTypeName: a.sareeType.name,
      startDate: a.warpStartDate!,
      duration: daysBetween(a.previousAssignment!.twentyFourthWovenAt!, a.warpStartDate!),
    }));

  // Material usage vs. the SareeType formula (v2 gap #4 — see CLAUDE.md's
  // "v2 structural-gap roadmap"). Note this compares like-with-like grams/
  // Nos (actual issued vs. formula-expected for the sarees actually
  // received) rather than netting Warp+Weft+Jari against total saree
  // weight the way the reference mockup's panel did — Warp and Jari are
  // both counted in Nos in this schema (see RawMaterialCategory's "Warp is
  // always Nos" convention and SareeType.jariPerSaree's own comment), not
  // grams, so a combined "material weight" sum across all three would mix
  // incompatible units. Total saree weight (from Phase 2) is still shown,
  // just as its own informational stat rather than netted into a fabricated
  // wastage %.
  const reconciliation = completed.map((a) => {
    const sareesReceived = a.receivingEntries.length;
    const totalWeightGram = a.receivingEntries.reduce((sum, e) => sum + (e.weightGram ? Number(e.weightGram) : 0), 0);
    const missingWeightCount = a.receivingEntries.filter((e) => e.weightGram === null).length;

    const weftIssuedGrams = a.materialIssues.reduce((sum, m) => sum + Number(m.weftIssuedGrams), 0);
    const expectedWeftGrams = Number(a.sareeType.weftGramsPerSaree) * sareesReceived;
    const weftVarianceGrams = weftIssuedGrams - expectedWeftGrams;
    const weftVariancePct = expectedWeftGrams > 0 ? (weftVarianceGrams / expectedWeftGrams) * 100 : null;

    const jariIssuedNos = a.materialIssues.reduce((sum, m) => sum + Number(m.jariIssued), 0);
    const expectedJariNos = Number(a.sareeType.jariPerSaree) * sareesReceived;
    const jariVarianceNos = jariIssuedNos - expectedJariNos;
    const jariVariancePct = expectedJariNos > 0 ? (jariVarianceNos / expectedJariNos) * 100 : null;

    return {
      id: a.id,
      sareeTypeName: a.sareeType.name,
      sareesReceived,
      totalWeightGram,
      missingWeightCount,
      weftIssuedGrams,
      weftVarianceGrams,
      weftVariancePct,
      jariIssuedNos,
      jariVarianceNos,
      jariVariancePct,
    };
  });

  return (
    <div>
      <Link
        href="/settings/weavers"
        className="flex items-center gap-1.5 text-sm text-ink/60 hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to weavers
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-ink">{weaver.name}</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            weaver.isActive ? 'bg-green-100 text-green-700' : 'bg-ink/10 text-ink/50'
          }`}
        >
          {weaver.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <p className="text-xs uppercase text-ink/40">Contact</p>
          <p className="mt-1 text-sm text-ink">{weaver.mobile || '—'}</p>
        </div>
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <p className="text-xs uppercase text-ink/40">Assigned Godown</p>
          <p className="mt-1 text-sm text-ink">{weaver.assignedLocation.name}</p>
        </div>
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <p className="text-xs uppercase text-ink/40">Saree Types</p>
          <p className="mt-1 text-sm text-ink">
            {weaver.sareeTypes.map((s) => s.sareeType.name).join(', ') || '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <p className="text-xs uppercase text-ink/40">Address</p>
          <p className="mt-1 text-sm text-ink">{weaver.address || '—'}</p>
        </div>
      </div>

      {weaver.notes && (
        <div className="mt-4 rounded-2xl border border-brand-100 bg-white p-4">
          <p className="text-xs uppercase text-ink/40">Notes</p>
          <p className="mt-1 text-sm text-ink">{weaver.notes}</p>
        </div>
      )}

      <div className="mt-8">
        <h3 className="font-display text-lg font-semibold text-ink">Performance</h3>
        <p className="mt-1 text-xs text-ink/50">
          Based on completed warp cycles — not a judgement, just the numbers.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-brand-100 bg-white p-4">
            <p className="text-2xl font-semibold text-ink">{totalCompletedWarps}</p>
            <p className="mt-1 text-xs text-ink/50">Completed warps</p>
          </div>
          <div className="rounded-2xl border border-brand-100 bg-white p-4">
            <p className="text-2xl font-semibold text-ink">{totalSarees}</p>
            <p className="mt-1 text-xs text-ink/50">Total sarees received</p>
          </div>
          <div className="rounded-2xl border border-brand-100 bg-white p-4">
            <p className="text-2xl font-semibold text-ink">
              {avgWarpCompletionDays !== null ? fmtDays(avgWarpCompletionDays) : '—'}
            </p>
            <p className="mt-1 text-xs text-ink/50">Avg. warp completion</p>
          </div>
          <div className="rounded-2xl border border-brand-100 bg-white p-4">
            <p className="text-2xl font-semibold text-ink">
              {avgSareesPerDay !== null ? avgSareesPerDay.toFixed(2) : '—'}
            </p>
            <p className="mt-1 text-xs text-ink/50">Avg. sarees / day</p>
          </div>
          <div className="rounded-2xl border border-brand-100 bg-white p-4">
            <p className="text-2xl font-semibold text-ink">{damageCount}</p>
            <p className="mt-1 text-xs text-ink/50">Total damage</p>
          </div>
          <div className="rounded-2xl border border-brand-100 bg-white p-4">
            <p className="text-2xl font-semibold text-ink">
              {damageRate !== null ? `${damageRate.toFixed(1)}%` : '—'}
            </p>
            <p className="mt-1 text-xs text-ink/50">Damage rate</p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="font-display text-lg font-semibold text-ink">Warp history</h3>
        <div className="mt-3 overflow-hidden rounded-2xl border border-brand-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase text-ink/50">
              <tr>
                <th className="px-4 py-3">Saree type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Duration</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-t border-brand-50">
                  <td className="px-4 py-3 font-medium text-ink">{a.sareeType.name}</td>
                  <td className="px-4 py-3 text-ink/70">{a.status.replace(/_/g, ' ').toLowerCase()}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {a.warpStartDate ? new Date(a.warpStartDate).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {a.completedAt ? new Date(a.completedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{a.receivingEntries.length} / 24</td>
                  <td className="px-4 py-3 text-ink/70">
                    {a.warpStartDate && a.completedAt ? fmtDays(daysBetween(a.warpStartDate, a.completedAt)) : '—'}
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink/40">
                    No warps assigned yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {reconciliation.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display text-lg font-semibold text-ink">Material Reconciliation</h3>
          <p className="mt-1 text-xs text-ink/50">
            Actual material issued vs. what the saree type's formula predicts for the sarees actually received —
            per completed warp. Total weight received is shown separately (needs saree weight, entered on Saree
            Receiving or Saree Book).
          </p>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-brand-100 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-50 text-xs uppercase text-ink/50">
                <tr>
                  <th className="px-4 py-3">Saree type</th>
                  <th className="px-4 py-3">Sarees</th>
                  <th className="px-4 py-3">Weft issued</th>
                  <th className="px-4 py-3">Weft vs. expected</th>
                  <th className="px-4 py-3">Jari issued</th>
                  <th className="px-4 py-3">Jari vs. expected</th>
                  <th className="px-4 py-3">Total weight received</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.map((r) => (
                  <tr key={r.id} className="border-t border-brand-50">
                    <td className="px-4 py-3 font-medium text-ink">{r.sareeTypeName}</td>
                    <td className="px-4 py-3 text-ink/70">{r.sareesReceived}</td>
                    <td className="px-4 py-3 text-ink/70">{r.weftIssuedGrams.toFixed(1)} g</td>
                    <td className="px-4 py-3">
                      {r.weftVariancePct === null ? (
                        <span className="text-ink/40">—</span>
                      ) : (
                        <span className={Math.abs(r.weftVariancePct) < 5 ? 'text-ink/60' : r.weftVariancePct > 0 ? 'text-red-600' : 'text-green-700'}>
                          {r.weftVarianceGrams >= 0 ? '+' : ''}
                          {r.weftVarianceGrams.toFixed(1)} g ({r.weftVariancePct >= 0 ? '+' : ''}
                          {r.weftVariancePct.toFixed(1)}%)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink/70">{r.jariIssuedNos.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      {r.jariVariancePct === null ? (
                        <span className="text-ink/40">—</span>
                      ) : (
                        <span className={Math.abs(r.jariVariancePct) < 5 ? 'text-ink/60' : r.jariVariancePct > 0 ? 'text-red-600' : 'text-green-700'}>
                          {r.jariVarianceNos >= 0 ? '+' : ''}
                          {r.jariVarianceNos.toFixed(2)} ({r.jariVariancePct >= 0 ? '+' : ''}
                          {r.jariVariancePct.toFixed(1)}%)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink/70">
                      {r.totalWeightGram > 0 ? `${r.totalWeightGram.toFixed(0)} g` : '—'}
                      {r.missingWeightCount > 0 && (
                        <span className="ml-1 text-xs text-amber-600">({r.missingWeightCount} missing weight)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {changeovers.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display text-lg font-semibold text-ink">Changeover history</h3>
          <p className="mt-1 text-xs text-ink/50">
            Time between the previous warp's 24th saree being woven and this warp's actual start date.
          </p>
          <div className="mt-3 overflow-hidden rounded-2xl border border-brand-100 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-50 text-xs uppercase text-ink/50">
                <tr>
                  <th className="px-4 py-3">New warp</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Changeover time</th>
                </tr>
              </thead>
              <tbody>
                {changeovers.map((c) => (
                  <tr key={c.id} className="border-t border-brand-50">
                    <td className="px-4 py-3 font-medium text-ink">{c.sareeTypeName}</td>
                    <td className="px-4 py-3 text-ink/70">{new Date(c.startDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-ink/70">{fmtDays(c.duration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <WeaverLedgerClient
        weaverId={weaver.id}
        balance={runningBalance}
        entries={ledgerRows}
        sareeTypes={sareeTypes.map((s) => ({ id: s.id, name: s.name }))}
        wageOptions={wageOptions}
      />
    </div>
  );
}

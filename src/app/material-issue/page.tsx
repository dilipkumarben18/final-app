import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { MaterialIssueClient } from './MaterialIssueClient';

export default async function MaterialIssuePage() {
  await requirePermission('materialIssue');

  const [weavers, sareeTypes, jariMaterials, weftMaterials, recent] = await Promise.all([
    prisma.weaverProfile.findMany({
      where: { isActive: true },
      include: {
        sareeTypes: { include: { sareeType: true } },
        // twentyFourthWovenAt: null excludes an old warp briefly awaiting
        // cut during changeover — material issue should reference the
        // warp actually being woven right now.
        warpAssignments: {
          where: { status: 'STARTED', twentyFourthWovenAt: null },
          include: {
            sareeType: true,
            // Which colour(s) this weaver's current physical warp actually
            // is — shown in the form so the Master can match Weft colour
            // (and pick Jari brands) to it. dyeingBatchWarp is the current
            // whole-warp-assignment link; shadeLines is the legacy
            // free-text fallback for assignments made before that existed.
            dyeingBatchWarp: { include: { shadeLines: { orderBy: { order: 'asc' } } } },
            shadeLines: true,
            // Every issue against this specific warp so far — powers the
            // "issued so far" panel (totals + a dated list) next to the
            // form, so the Master can see at a glance whether e.g. Weft
            // still needs catching up to Jari before the warp finishes.
            materialIssues: { orderBy: { date: 'desc' } },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.sareeType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.rawMaterial.findMany({ where: { category: 'JARI' }, orderBy: { name: 'asc' } }),
    prisma.rawMaterial.findMany({ where: { category: 'WEFT' }, orderBy: { name: 'asc' } }),
    prisma.materialIssue.findMany({
      include: { weaver: true, sareeType: true },
      orderBy: { date: 'desc' },
      take: 30,
    }),
  ]);

  // Brand/colour breakdown per issue lives in RawMaterialTransaction (no
  // FK on MaterialIssue itself, matching how DyeingBatch's line items
  // aren't duplicated there either) — batch-fetch and group in JS rather
  // than one query per row.
  const issueIds = recent.map((r) => r.id);
  const relatedTxns = issueIds.length
    ? await prisma.rawMaterialTransaction.findMany({
        where: { refType: 'MaterialIssue', refId: { in: issueIds } },
        include: { rawMaterial: { select: { name: true, category: true } } },
      })
    : [];
  const namesByIssue = new Map<string, { jari: string[]; weft: string | null }>();
  for (const txn of relatedTxns) {
    if (!txn.refId) continue;
    const entry = namesByIssue.get(txn.refId) ?? { jari: [], weft: null };
    if (txn.rawMaterial.category === 'JARI') entry.jari.push(txn.rawMaterial.name);
    else if (txn.rawMaterial.category === 'WEFT') entry.weft = txn.rawMaterial.name;
    namesByIssue.set(txn.refId, entry);
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Material Issue</h1>
        <p className="mt-1 text-sm text-ink/60">
          Issue Weft and a mix of two Jari brands to a weaver by saree count.
        </p>

        <div className="mt-6">
          <MaterialIssueClient
            weavers={weavers.map((w) => ({
              id: w.id,
              name: w.name,
              sareeTypeIds: w.sareeTypes.map((s) => s.sareeType.id),
              currentAssignment: w.warpAssignments[0]
                ? {
                    id: w.warpAssignments[0].id,
                    sareeTypeId: w.warpAssignments[0].sareeTypeId,
                    warpColours: (
                      w.warpAssignments[0].dyeingBatchWarp?.shadeLines ?? w.warpAssignments[0].shadeLines
                    )
                      .map((l) => l.shadeNumber.trim())
                      .filter(Boolean),
                    issuedSoFar: {
                      totalJariSarees: w.warpAssignments[0].materialIssues.reduce((sum, mi) => sum + mi.sareeCount, 0),
                      totalWeftSarees: w.warpAssignments[0].materialIssues.reduce(
                        (sum, mi) => sum + (mi.weftSareeCount || mi.sareeCount),
                        0
                      ),
                      issues: w.warpAssignments[0].materialIssues.map((mi) => ({
                        date: mi.date.toISOString(),
                        sareeCount: mi.sareeCount,
                        weftSareeCount: mi.weftSareeCount || mi.sareeCount,
                      })),
                    },
                  }
                : null,
            }))}
            sareeTypes={sareeTypes.map((s) => ({
              id: s.id,
              name: s.name,
              jariPerSaree: s.jariPerSaree.toString(),
              weftGramsPerSaree: s.weftGramsPerSaree.toString(),
            }))}
            jariMaterials={jariMaterials.map((m) => ({ id: m.id, name: m.name, currentStock: m.currentStock.toString(), unit: m.unit }))}
            weftMaterials={weftMaterials.map((m) => ({ id: m.id, name: m.name, currentStock: m.currentStock.toString(), unit: m.unit }))}
            recent={recent.map((r) => {
              const names = namesByIssue.get(r.id);
              return {
                id: r.id,
                weaverName: r.weaver.name,
                sareeTypeName: r.sareeType.name,
                sareeCount: r.sareeCount,
                jariIssued: r.jariIssued.toString(),
                jariBrands: names?.jari.join(' + ') || null,
                weftSareeCount: r.weftSareeCount || r.sareeCount,
                weftIssuedGrams: r.weftIssuedGrams.toString(),
                weftColour: names?.weft ?? null,
                date: r.date.toISOString(),
              };
            })}
          />
        </div>
      </main>
    </div>
  );
}

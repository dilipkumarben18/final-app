'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Field, TextInput, Select, PrimaryButton } from '@/components/ui/Form';
import { issueMaterial } from '@/lib/actions/materialIssue';

type IssuedSoFar = {
  totalJariSarees: number;
  totalWeftSarees: number;
  issues: { date: string; sareeCount: number; weftSareeCount: number }[];
};
type Weaver = {
  id: string;
  name: string;
  sareeTypeIds: string[];
  currentAssignment: { id: string; sareeTypeId: string; warpColours: string[]; issuedSoFar: IssuedSoFar } | null;
};
type SareeType = { id: string; name: string; jariPerSaree: string; weftGramsPerSaree: string };
type RawMaterialOption = { id: string; name: string; currentStock: string; unit: string };
type RecentIssue = {
  id: string;
  weaverName: string;
  sareeTypeName: string;
  sareeCount: number;
  jariIssued: string;
  jariBrands: string | null;
  weftSareeCount: number;
  weftIssuedGrams: string;
  weftColour: string | null;
  date: string;
};

const COUNT_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
const NONE = '';

export function MaterialIssueClient({
  weavers,
  sareeTypes,
  jariMaterials,
  weftMaterials,
  recent,
}: {
  weavers: Weaver[];
  sareeTypes: SareeType[];
  jariMaterials: RawMaterialOption[];
  weftMaterials: RawMaterialOption[];
  recent: RecentIssue[];
}) {
  const [weaverId, setWeaverId] = useState(weavers[0]?.id ?? '');
  const [sareeTypeId, setSareeTypeId] = useState(sareeTypes[0]?.id ?? '');
  const [sareeCount, setSareeCount] = useState(1);
  const [weftSareeCount, setWeftSareeCount] = useState(1);
  const [weftCountTouched, setWeftCountTouched] = useState(false);
  const [jariQuantity, setJariQuantity] = useState('');
  const [jariQtyTouched, setJariQtyTouched] = useState(false);
  const [jari1MaterialId, setJari1MaterialId] = useState(NONE);
  const [jari2MaterialId, setJari2MaterialId] = useState(NONE);
  const [jari1Quantity, setJari1Quantity] = useState('');
  const [jari2Quantity, setJari2Quantity] = useState('');
  const [weftColour, setWeftColour] = useState(weftMaterials[0]?.name ?? '');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  const weaver = weavers.find((w) => w.id === weaverId);
  const sareeType = sareeTypes.find((s) => s.id === sareeTypeId);
  const allowedSareeTypes = weaver
    ? sareeTypes.filter((s) => weaver.sareeTypeIds.length === 0 || weaver.sareeTypeIds.includes(s.id))
    : sareeTypes;

  const suggestedJariTotal = useMemo(
    () => (sareeType ? Number(sareeType.jariPerSaree) * sareeCount : 0),
    [sareeType, sareeCount]
  );
  const weftCalc = useMemo(
    () => (sareeType ? Number(sareeType.weftGramsPerSaree) * weftSareeCount : 0),
    [sareeType, weftSareeCount]
  );

  // Weft count follows the main saree count by default (the common case
  // where every saree in the batch needs new Weft) — but stops following
  // once the user overrides it by hand, so it can go lower (e.g. Jari for
  // 6 sarees, Weft for only 3) or be set to 0 to issue Jari on its own,
  // giving Weft separately later. The two counts are otherwise fully
  // independent — Weft is no longer capped at the Jari count.
  useEffect(() => {
    if (weftCountTouched) return;
    setWeftSareeCount(sareeCount);
  }, [sareeCount, weftCountTouched]);

  // Re-suggest the calculated total whenever saree type/count changes,
  // unless the user already edited it by hand.
  useEffect(() => {
    if (jariQtyTouched) return;
    setJariQuantity(suggestedJariTotal.toFixed(3));
  }, [suggestedJariTotal, jariQtyTouched]);

  // Re-split the total evenly across whichever brand slots are actually
  // filled in, whenever the total or the set of picked brands changes —
  // brand attribution is optional, so this only runs for slots in use.
  useEffect(() => {
    const total = Number(jariQuantity) || 0;
    if (jari1MaterialId && jari2MaterialId) {
      const half = (total / 2).toFixed(3);
      setJari1Quantity(half);
      setJari2Quantity(half);
    } else if (jari1MaterialId) {
      setJari1Quantity(total.toFixed(3));
      setJari2Quantity('');
    } else if (jari2MaterialId) {
      setJari2Quantity(total.toFixed(3));
      setJari1Quantity('');
    } else {
      setJari1Quantity('');
      setJari2Quantity('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jariQuantity, jari1MaterialId, jari2MaterialId]);

  function handleWeaverChange(id: string) {
    setWeaverId(id);
    const w = weavers.find((x) => x.id === id);
    if (w?.currentAssignment) setSareeTypeId(w.currentAssignment.sareeTypeId);
  }

  const jari1And2Same = jari1MaterialId && jari2MaterialId && jari1MaterialId === jari2MaterialId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const typedWeft = weftColour.trim();
    const matchedWeft = weftMaterials.find((m) => m.name.toLowerCase() === typedWeft.toLowerCase());

    setSaving(true);
    const result = await issueMaterial({
      weaverId,
      sareeTypeId,
      warpAssignmentId: weaver?.currentAssignment?.id,
      sareeCount,
      weftSareeCount,
      jariQuantity,
      jari1MaterialId: jari1MaterialId || undefined,
      jari1Quantity: jari1MaterialId ? jari1Quantity : undefined,
      jari2MaterialId: jari2MaterialId || undefined,
      jari2Quantity: jari2MaterialId ? jari2Quantity : undefined,
      weftMaterialId: matchedWeft?.id,
      weftColourName: matchedWeft ? undefined : typedWeft,
      remarks,
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Material issued');
    setRemarks('');
    setSareeCount(1);
    setWeftCountTouched(false);
    setJariQtyTouched(false);
    setJari1MaterialId(NONE);
    setJari2MaterialId(NONE);
  }

  if (weavers.length === 0 || sareeTypes.length === 0) {
    return <p className="text-sm text-ink/60">You need at least one active Weaver and Saree Type first.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,32rem)_1fr] lg:items-start">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-brand-100 bg-white p-5">
        <Field label="Weaver">
          <Select value={weaverId} onChange={(e) => handleWeaverChange(e.target.value)} required>
            {weavers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Saree type">
          <Select value={sareeTypeId} onChange={(e) => setSareeTypeId(e.target.value)} required>
            {allowedSareeTypes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        {weaver?.currentAssignment && (
          <div className="rounded-lg bg-brand-50/60 px-3 py-2">
            <p className="text-xs text-ink/50">Issuing against the weaver&apos;s current warp.</p>
            {weaver.currentAssignment.warpColours.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-ink/70">This warp&apos;s colour(s):</span>
                {weaver.currentAssignment.warpColours.map((colour) => (
                  <button
                    key={colour}
                    type="button"
                    onClick={() => setWeftColour(colour)}
                    title="Click to use as the Weft colour"
                    className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-200"
                  >
                    {colour}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-ink/40">No warp colour recorded for this assignment.</p>
            )}
          </div>
        )}
        <Field label="Saree count">
          <div className="flex gap-2">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSareeCount(n)}
                className={`h-9 w-9 rounded-lg text-sm font-medium ${
                  sareeCount === n ? 'bg-brand-500 text-white' : 'border border-brand-100 text-ink/70 hover:bg-brand-50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>

        <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 text-sm">
          <Field label="Jari quantity (Nos)">
            <TextInput
              type="number"
              min={0}
              step="0.001"
              value={jariQuantity}
              onChange={(e) => {
                setJariQtyTouched(true);
                setJariQuantity(e.target.value);
              }}
              required
            />
          </Field>

          <p className="mt-3 text-xs font-medium text-ink/70">
            Which brand(s) is it from? Optional — leave blank if you're not tracking that for this issue.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <Field label="Jari 1 (optional)">
                <Select value={jari1MaterialId} onChange={(e) => setJari1MaterialId(e.target.value)}>
                  <option value={NONE}>Not specified</option>
                  {jariMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {jari1MaterialId && (
                <TextInput
                  type="number"
                  min={0}
                  step="0.001"
                  className="mt-2"
                  value={jari1Quantity}
                  onChange={(e) => setJari1Quantity(e.target.value)}
                  required
                />
              )}
            </div>
            <div>
              <Field label="Jari 2 (optional)">
                <Select value={jari2MaterialId} onChange={(e) => setJari2MaterialId(e.target.value)}>
                  <option value={NONE}>Not specified</option>
                  {jariMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {jari2MaterialId && (
                <TextInput
                  type="number"
                  min={0}
                  step="0.001"
                  className="mt-2"
                  value={jari2Quantity}
                  onChange={(e) => setJari2Quantity(e.target.value)}
                  required
                />
              )}
            </div>
          </div>
          {jari1And2Same && <p className="mt-2 text-xs text-red-600">Jari 1 and Jari 2 must be different brands.</p>}
        </div>

        <Field label="Weft colour (select or type a new one)">
          <TextInput
            list="weft-colour-options"
            value={weftColour}
            onChange={(e) => setWeftColour(e.target.value)}
            placeholder="e.g. Red, Gold…"
            required={weftSareeCount > 0}
            disabled={weftSareeCount === 0}
          />
          <datalist id="weft-colour-options">
            {weftMaterials.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Weft needed for how many of these sarees">
          <div className="flex gap-2">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setWeftCountTouched(true);
                  setWeftSareeCount(n);
                }}
                className={`h-9 w-9 rounded-lg text-sm font-medium ${
                  weftSareeCount === n ? 'bg-brand-500 text-white' : 'border border-brand-100 text-ink/70 hover:bg-brand-50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {weftSareeCount === 0 && (
            <p className="mt-1 text-xs text-ink/50">No Weft in this issue — give it separately later.</p>
          )}
          {weftSareeCount > 0 && weftSareeCount !== sareeCount && (
            <p className="mt-1 text-xs text-ink/50">
              Issuing Jari for {sareeCount} sarees, but Weft for {weftSareeCount}.
            </p>
          )}
        </Field>
        <p className="-mt-1 text-xs text-ink/50">
          Weft to issue: {weftCalc.toFixed(2)} g ({(weftCalc / 1000).toFixed(3)} kg). Typing a new colour adds it to
          the Raw Material Master automatically.
        </p>

        <Field label="Remarks">
          <TextInput value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>

        <div className="flex justify-end">
          <PrimaryButton type="submit" disabled={saving || !!jari1And2Same}>
            {saving ? 'Issuing…' : 'Issue material'}
          </PrimaryButton>
        </div>
      </form>

      <div className="rounded-2xl border border-brand-100 bg-white p-5">
        <h2 className="font-display text-base font-semibold text-ink">
          Issued so far {weaver ? `— ${weaver.name}` : ''}
        </h2>
        {!weaver?.currentAssignment && (
          <p className="mt-2 text-sm text-ink/50">This weaver has no warp currently being woven.</p>
        )}
        {weaver?.currentAssignment && (
          <>
            <p className="mt-1 text-sm text-ink/60">On the current warp being woven:</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-brand-50 p-3">
                <p className="text-xs uppercase text-ink/50">Jari</p>
                <p className="text-lg font-semibold text-ink">
                  {weaver.currentAssignment.issuedSoFar.totalJariSarees} sarees
                </p>
              </div>
              <div className="rounded-lg bg-brand-50 p-3">
                <p className="text-xs uppercase text-ink/50">Weft</p>
                <p className="text-lg font-semibold text-ink">
                  {weaver.currentAssignment.issuedSoFar.totalWeftSarees} sarees
                </p>
              </div>
            </div>

            <div className="mt-4 max-h-72 overflow-auto">
              {weaver.currentAssignment.issuedSoFar.issues.length === 0 && (
                <p className="text-sm text-ink/40">Nothing issued yet on this warp.</p>
              )}
              {weaver.currentAssignment.issuedSoFar.issues.map((iss, i) => (
                <div key={i} className="flex items-center justify-between border-t border-brand-50 py-2 text-sm first:border-t-0">
                  <span className="text-ink/60">
                    {new Date(iss.date).toLocaleDateString()}{' '}
                    {new Date(iss.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-ink">
                    Jari for {iss.sareeCount} sarees, Weft for {iss.weftSareeCount} sarees
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      </div>

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">Recent issues</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-brand-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase text-ink/50">
              <tr>
                <th className="px-4 py-3">Weaver</th>
                <th className="px-4 py-3">Saree type</th>
                <th className="px-4 py-3">Count</th>
                <th className="px-4 py-3">Jari (brands)</th>
                <th className="px-4 py-3">Weft (colour)</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-brand-50">
                  <td className="px-4 py-3 font-medium text-ink">{r.weaverName}</td>
                  <td className="px-4 py-3 text-ink/70">{r.sareeTypeName}</td>
                  <td className="px-4 py-3 text-ink/70">{r.sareeCount}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {r.jariIssued} <span className="text-ink/50">({r.jariBrands || 'brand not specified'})</span>
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {r.weftIssuedGrams} g{r.weftSareeCount !== r.sareeCount ? ` (${r.weftSareeCount} sarees)` : ''}{' '}
                    {r.weftColour && <span className="text-ink/50">({r.weftColour})</span>}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{new Date(r.date).toLocaleDateString()}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink/40">
                    No material issued yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

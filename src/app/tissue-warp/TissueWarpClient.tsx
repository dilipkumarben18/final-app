'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Field, TextInput, Select, PrimaryButton } from '@/components/ui/Form';
import { createTissueWarp, createPateRoll } from '@/lib/actions/tissueWarp';

type MarcsOption = { id: string; name: string; unit: string; currentStock: string };
type RecentWarp = {
  id: string;
  reference: string;
  materialName: string;
  capacity: number;
  receivedAt: string;
  weaverName: string | null;
};
type RecentPate = { id: string; reference: string; materialName: string; weightUsedKg: string; createdAt: string };

export function TissueWarpClient({
  marcsOptions,
  recentWarps,
  recentPate,
}: {
  marcsOptions: MarcsOption[];
  recentWarps: RecentWarp[];
  recentPate: RecentPate[];
}) {
  const router = useRouter();

  const [warpMaterialId, setWarpMaterialId] = useState(marcsOptions[0]?.id ?? '');
  const [warpWeightKg, setWarpWeightKg] = useState('');
  const [sareeCapacity, setSareeCapacity] = useState('36');
  const [warpRemarks, setWarpRemarks] = useState('');
  const [savingWarp, setSavingWarp] = useState(false);

  const [pateMaterialId, setPateMaterialId] = useState(marcsOptions[0]?.id ?? '');
  const [pateWeightKg, setPateWeightKg] = useState('');
  const [pateRemarks, setPateRemarks] = useState('');
  const [savingPate, setSavingPate] = useState(false);

  async function handleCreateWarp(e: React.FormEvent) {
    e.preventDefault();
    setSavingWarp(true);
    const result = await createTissueWarp({
      rawMaterialId: warpMaterialId,
      weightUsedKg: warpWeightKg,
      sareeCapacity,
      remarks: warpRemarks || undefined,
    });
    setSavingWarp(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Tissue Warp ready — assign it from Warp Alerts');
    setWarpWeightKg('');
    setWarpRemarks('');
    router.refresh();
  }

  async function handleCreatePate(e: React.FormEvent) {
    e.preventDefault();
    setSavingPate(true);
    const result = await createPateRoll({
      rawMaterialId: pateMaterialId,
      weightUsedKg: pateWeightKg,
      remarks: pateRemarks || undefined,
    });
    setSavingPate(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Pate roll recorded');
    setPateWeightKg('');
    setPateRemarks('');
    router.refresh();
  }

  if (marcsOptions.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        No Jari-category raw materials yet — add "Jari Marcs" (or however you name it) under Settings →
        Raw Materials with category Jari first.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Tissue Warp</h2>
        <div className="mt-3 grid gap-6 lg:grid-cols-2">
          <form onSubmit={handleCreateWarp} className="space-y-3 rounded-2xl border border-brand-100 bg-white p-5">
            <Field label="Jari Marcs material">
              <Select value={warpMaterialId} onChange={(e) => setWarpMaterialId(e.target.value)} required>
                {marcsOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.currentStock} {m.unit} in stock)
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Weight used">
                <TextInput
                  type="number"
                  step="0.01"
                  min="0"
                  value={warpWeightKg}
                  onChange={(e) => setWarpWeightKg(e.target.value)}
                  required
                />
              </Field>
              <Field label="Sarees this roller makes">
                <TextInput
                  type="number"
                  min="1"
                  max="60"
                  value={sareeCapacity}
                  onChange={(e) => setSareeCapacity(e.target.value)}
                  required
                />
              </Field>
            </div>
            <Field label="Remarks (optional)">
              <TextInput value={warpRemarks} onChange={(e) => setWarpRemarks(e.target.value)} />
            </Field>
            <PrimaryButton type="submit" disabled={savingWarp}>
              {savingWarp ? 'Saving…' : 'Make Tissue Warp'}
            </PrimaryButton>
          </form>

          <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white">
            <div className="border-b border-brand-50 p-4">
              <h3 className="font-display text-sm font-semibold text-ink">Recent Tissue Warps</h3>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-50 text-xs uppercase text-ink/50">
                <tr>
                  <th className="px-3 py-2">Ref</th>
                  <th className="px-3 py-2">Sarees</th>
                  <th className="px-3 py-2">Weaver</th>
                  <th className="px-3 py-2">Made</th>
                </tr>
              </thead>
              <tbody>
                {recentWarps.map((w) => (
                  <tr key={w.id} className="border-t border-brand-50">
                    <td className="px-3 py-2 font-medium text-ink">{w.reference}</td>
                    <td className="px-3 py-2 text-ink/70">{w.capacity}</td>
                    <td className="px-3 py-2 text-ink/70">{w.weaverName ?? <span className="text-ink/40">Unassigned</span>}</td>
                    <td className="px-3 py-2 text-ink/70">{new Date(w.receivedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {recentWarps.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-ink/40">
                      No Tissue Warps made yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Pate</h2>
        <p className="text-sm text-ink/60">A separate roll made from marcs — its own product, not tied to a saree or weaver.</p>
        <div className="mt-3 grid gap-6 lg:grid-cols-2">
          <form onSubmit={handleCreatePate} className="space-y-3 rounded-2xl border border-brand-100 bg-white p-5">
            <Field label="Jari Marcs material">
              <Select value={pateMaterialId} onChange={(e) => setPateMaterialId(e.target.value)} required>
                {marcsOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.currentStock} {m.unit} in stock)
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Weight used">
              <TextInput type="number" step="0.01" min="0" value={pateWeightKg} onChange={(e) => setPateWeightKg(e.target.value)} required />
            </Field>
            <Field label="Remarks (optional)">
              <TextInput value={pateRemarks} onChange={(e) => setPateRemarks(e.target.value)} />
            </Field>
            <PrimaryButton type="submit" disabled={savingPate}>
              {savingPate ? 'Saving…' : 'Record Pate roll'}
            </PrimaryButton>
          </form>

          <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white">
            <div className="border-b border-brand-50 p-4">
              <h3 className="font-display text-sm font-semibold text-ink">Recent Pate rolls</h3>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-50 text-xs uppercase text-ink/50">
                <tr>
                  <th className="px-3 py-2">Ref</th>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2">Weight</th>
                  <th className="px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentPate.map((p) => (
                  <tr key={p.id} className="border-t border-brand-50">
                    <td className="px-3 py-2 font-medium text-ink">{p.reference}</td>
                    <td className="px-3 py-2 text-ink/70">{p.materialName}</td>
                    <td className="px-3 py-2 text-ink/70">{p.weightUsedKg} kg</td>
                    <td className="px-3 py-2 text-ink/70">{new Date(p.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {recentPate.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-ink/40">
                      No Pate rolls recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

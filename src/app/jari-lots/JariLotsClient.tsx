'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { assignJariBrand } from '@/lib/actions/jariLots';

type UnassignedLot = {
  id: string;
  partyName: string;
  purchaseNumber: string;
  sourceMaterialName: string;
  quantity: string;
  unit: string;
  receivedDate: string;
};
type AssignedLot = {
  id: string;
  partyName: string;
  purchaseNumber: string;
  quantity: string;
  unit: string;
  brandName: string;
  assignedAt: string | null;
};
type JariMaterial = { id: string; name: string };

export function JariLotsClient({
  unassigned,
  assigned,
  jariMaterials,
}: {
  unassigned: UnassignedLot[];
  assigned: AssignedLot[];
  jariMaterials: JariMaterial[];
}) {
  const [activeLot, setActiveLot] = useState<UnassignedLot | null>(null);
  const [brandName, setBrandName] = useState('');
  const [saving, setSaving] = useState(false);

  function openAssign(lot: UnassignedLot) {
    setActiveLot(lot);
    setBrandName('');
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!activeLot) return;
    const typed = brandName.trim();
    if (!typed) return;
    const matched = jariMaterials.find((m) => m.name.toLowerCase() === typed.toLowerCase());

    setSaving(true);
    const result = await assignJariBrand({
      lotId: activeLot.id,
      materialId: matched?.id,
      newBrandName: matched ? undefined : typed,
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Assigned to ${typed}`);
    setActiveLot(null);
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-lg font-semibold text-ink">Unassigned boxes ({unassigned.length})</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-brand-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase text-ink/50">
              <tr>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Purchase</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {unassigned.map((lot) => (
                <tr key={lot.id} className="border-t border-brand-50">
                  <td className="px-4 py-3 font-medium text-ink">{lot.partyName}</td>
                  <td className="px-4 py-3 text-ink/70">{lot.purchaseNumber}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {lot.quantity} {lot.unit}
                    <span className="ml-2 text-xs text-ink/40">Unassigned brand ({lot.sourceMaterialName})</span>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{new Date(lot.receivedDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <SecondaryButton type="button" onClick={() => openAssign(lot)}>
                      Assign brand
                    </SecondaryButton>
                  </td>
                </tr>
              ))}
              {unassigned.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink/40">
                    No unassigned Jari boxes right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">Recently assigned</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-brand-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase text-ink/50">
              <tr>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Purchase</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3">Assigned on</th>
              </tr>
            </thead>
            <tbody>
              {assigned.map((lot) => (
                <tr key={lot.id} className="border-t border-brand-50">
                  <td className="px-4 py-3 font-medium text-ink">{lot.partyName}</td>
                  <td className="px-4 py-3 text-ink/70">{lot.purchaseNumber}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {lot.quantity} {lot.unit}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{lot.brandName}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {lot.assignedAt ? new Date(lot.assignedAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
              {assigned.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink/40">
                    Nothing assigned yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={!!activeLot} title={`Assign brand — ${activeLot?.partyName ?? ''}`} onClose={() => setActiveLot(null)}>
        {activeLot && (
          <form onSubmit={handleAssign} className="space-y-3">
            <p className="text-sm text-ink/60">
              {activeLot.quantity} {activeLot.unit} from {activeLot.partyName} ({activeLot.purchaseNumber}).
            </p>
            <Field label="Brand name (select or type a new one)">
              <TextInput
                list="jari-brand-options"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="e.g. Balaji…"
                autoFocus
                required
              />
              <datalist id="jari-brand-options">
                {jariMaterials.map((m) => (
                  <option key={m.id} value={m.name} />
                ))}
              </datalist>
            </Field>
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setActiveLot(null)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? 'Assigning…' : 'Assign'}
              </PrimaryButton>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

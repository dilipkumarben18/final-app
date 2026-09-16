'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, TextArea, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { createWeaver, setWeaverActive } from '@/lib/actions/weavers';
import { Plus } from 'lucide-react';

type Weaver = {
  id: string;
  name: string;
  mobile: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  assignedLocation: { name: string };
  sareeTypes: { sareeType: { id: string; name: string } }[];
  balance: number;
};

function formatMoney(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

type LocationOption = { id: string; name: string };
type SareeTypeOption = { id: string; name: string };

const emptyForm = {
  name: '',
  mobile: '',
  address: '',
  notes: '',
  assignedLocationId: '',
  sareeTypeIds: [] as string[],
};

export function WeaversClient({
  weavers,
  locations,
  sareeTypes,
}: {
  weavers: Weaver[];
  locations: LocationOption[];
  sareeTypes: SareeTypeOption[];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setForm({ ...emptyForm, assignedLocationId: locations[0]?.id ?? '' });
    setModalOpen(true);
  }

  function toggleSareeType(id: string) {
    setForm((f) => ({
      ...f,
      sareeTypeIds: f.sareeTypeIds.includes(id)
        ? f.sareeTypeIds.filter((x) => x !== id)
        : [...f.sareeTypeIds, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await createWeaver(form);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Weaver added');
    setModalOpen(false);
  }

  async function toggleActive(w: Weaver) {
    const result = await setWeaverActive(w.id, !w.isActive);
    if (result.error) toast.error(result.error);
  }

  return (
    <div>
      <div className="flex justify-end">
        <PrimaryButton onClick={openCreate} className="flex items-center gap-1.5">
          <Plus size={16} /> Add weaver
        </PrimaryButton>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Saree Types</th>
              <th className="px-4 py-3">Assigned Godown</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {weavers.map((w) => (
              <tr key={w.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">
                  <Link href={`/settings/weavers/${w.id}`} className="hover:underline">
                    {w.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink/70">{w.mobile ?? '—'}</td>
                <td className="px-4 py-3 text-ink/70">
                  {w.sareeTypes.map((s) => s.sareeType.name).join(', ') || '—'}
                </td>
                <td className="px-4 py-3 text-ink/70">{w.assignedLocation.name}</td>
                <td className="px-4 py-3">
                  {w.balance === 0 ? (
                    <span className="text-ink/40">Settled</span>
                  ) : (
                    <span className={`font-medium ${w.balance > 0 ? 'text-green-700' : 'text-red-600'}`}>
                      ₹{formatMoney(Math.abs(w.balance))} {w.balance > 0 ? 'owed' : 'advanced'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      w.isActive ? 'bg-green-100 text-green-700' : 'bg-ink/10 text-ink/50'
                    }`}
                  >
                    {w.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => toggleActive(w)} className="text-ink/50 hover:underline">
                    {w.isActive ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
            {weavers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink/40">
                  No weavers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add weaver">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Name">
            <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Mobile number (optional)">
            <TextInput
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            />
          </Field>
          <Field label="Assigned Godown / Factory">
            <Select
              required
              value={form.assignedLocationId}
              onChange={(e) => setForm({ ...form, assignedLocationId: e.target.value })}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Saree types woven">
            <div className="flex flex-wrap gap-3 pt-1">
              {sareeTypes.map((st) => (
                <label key={st.id} className="flex items-center gap-1.5 text-sm text-ink/80">
                  <input
                    type="checkbox"
                    checked={form.sareeTypeIds.includes(st.id)}
                    onChange={() => toggleSareeType(st.id)}
                  />
                  {st.name}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Address">
            <TextInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Notes (rate details, etc.)">
            <TextArea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Add weaver'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

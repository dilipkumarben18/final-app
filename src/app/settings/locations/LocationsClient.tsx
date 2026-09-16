'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { createLocation, setLocationActive, updateLocation } from '@/lib/actions/locations';
import { Plus, Pencil } from 'lucide-react';

type Location = {
  id: string;
  name: string;
  kind: 'GODOWN' | 'HOME';
  address: string | null;
  isActive: boolean;
};

const emptyForm = { name: '', kind: 'GODOWN' as const, address: '' };

export function LocationsClient({ locations }: { locations: Location[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState<{ name: string; kind: 'GODOWN' | 'HOME'; address: string }>(emptyForm);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(loc: Location) {
    setEditing(loc);
    setForm({ name: loc.name, kind: loc.kind, address: loc.address ?? '' });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = editing ? await updateLocation(editing.id, form) : await createLocation(form);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(editing ? 'Location updated' : 'Location added');
    setModalOpen(false);
  }

  async function toggleActive(loc: Location) {
    const result = await setLocationActive(loc.id, !loc.isActive);
    if (result.error) toast.error(result.error);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="max-w-md text-sm text-ink/60">
          Godowns (factories) and Home ready-to-sale stock. Only Godown → Home transfers are
          allowed, never godown-to-godown.
        </p>
        <PrimaryButton onClick={openCreate} className="flex shrink-0 items-center gap-1.5">
          <Plus size={16} /> Add location
        </PrimaryButton>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => (
              <tr key={loc.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">{loc.name}</td>
                <td className="px-4 py-3 text-ink/70">{loc.kind === 'GODOWN' ? 'Godown' : 'Home'}</td>
                <td className="px-4 py-3 text-ink/70">{loc.address || '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      loc.isActive ? 'bg-green-100 text-green-700' : 'bg-ink/10 text-ink/50'
                    }`}
                  >
                    {loc.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(loc)} className="text-ink/50 hover:text-ink" title="Edit">
                    <Pencil size={16} className="inline" />
                  </button>
                  <button onClick={() => toggleActive(loc)} className="ml-3 text-sm text-ink/50 hover:underline">
                    {loc.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {locations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink/40">
                  No locations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add location'}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Name">
            <TextInput
              required
              placeholder="e.g. Factory / Godown 5"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Kind">
            <Select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as 'GODOWN' | 'HOME' })}
            >
              <option value="GODOWN">Godown</option>
              <option value="HOME">Home</option>
            </Select>
          </Field>
          <Field label="Address / details">
            <TextInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add location'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { createFirm, setFirmActive, updateFirm } from '@/lib/actions/firms';
import { Plus } from 'lucide-react';

type Firm = {
  id: string;
  name: string;
  gstNumber: string | null;
  address: string | null;
  contactInfo: string | null;
  isActive: boolean;
};

const emptyForm = { name: '', gstNumber: '', address: '', contactInfo: '' };

export function FirmsClient({ firms }: { firms: Firm[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Firm | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(f: Firm) {
    setEditing(f);
    setForm({
      name: f.name,
      gstNumber: f.gstNumber ?? '',
      address: f.address ?? '',
      contactInfo: f.contactInfo ?? '',
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = editing ? await updateFirm(editing.id, form) : await createFirm(form);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(editing ? 'Firm updated' : 'Firm added');
    setModalOpen(false);
  }

  async function toggleActive(f: Firm) {
    const result = await setFirmActive(f.id, !f.isActive);
    if (result.error) toast.error(result.error);
  }

  return (
    <div>
      <div className="flex justify-end">
        <PrimaryButton onClick={openCreate} className="flex items-center gap-1.5">
          <Plus size={16} /> Add firm
        </PrimaryButton>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">GST No.</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {firms.map((f) => (
              <tr key={f.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">{f.name}</td>
                <td className="px-4 py-3 text-ink/70">{f.gstNumber || '—'}</td>
                <td className="px-4 py-3 text-ink/70">{f.address || '—'}</td>
                <td className="px-4 py-3 text-ink/70">{f.contactInfo || '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      f.isActive ? 'bg-green-100 text-green-700' : 'bg-ink/10 text-ink/50'
                    }`}
                  >
                    {f.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(f)} className="text-brand-700 hover:underline">
                    Edit
                  </button>
                  <button onClick={() => toggleActive(f)} className="ml-3 text-ink/50 hover:underline">
                    {f.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit firm' : 'Add firm'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Firm name">
            <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="GST number">
            <TextInput value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} />
          </Field>
          <Field label="Address">
            <TextInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Contact information">
            <TextInput
              placeholder="Phone / contact person"
              value={form.contactInfo}
              onChange={(e) => setForm({ ...form, contactInfo: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add firm'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

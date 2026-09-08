'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { createWorker, setUserActive } from '@/lib/actions/users';
import { Plus } from 'lucide-react';

type Worker = {
  id: string;
  name: string;
  mobile: string;
  isActive: boolean;
};

export function UsersClient({ workers }: { workers: Worker[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', mobile: '', password: '' });
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setForm({ name: '', mobile: '', password: '' });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await createWorker(form);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Worker account created');
    setModalOpen(false);
  }

  async function toggleActive(w: Worker) {
    const result = await setUserActive(w.id, !w.isActive);
    if (result.error) toast.error(result.error);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink/60">
          Workers can access Saree Receiving, Warp Alerts, Assign Warp, Material Issue, and Damage
          Entry only — this is fixed and not configurable per account.
        </p>
        <PrimaryButton onClick={openCreate} className="flex items-center gap-1.5 whitespace-nowrap">
          <Plus size={16} /> Add worker
        </PrimaryButton>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">{w.name}</td>
                <td className="px-4 py-3 text-ink/70">{w.mobile}</td>
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
            {workers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink/40">
                  No Worker accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add worker">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Name">
            <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Mobile number (used to log in)">
            <TextInput
              required
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Add worker'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

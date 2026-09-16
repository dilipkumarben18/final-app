'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, PrimaryButton, SecondaryButton } from '@/components/ui/Form';

export type CodeNameRow = { id: string; code: string; name: string; isActive: boolean };
type ActionResult = { error?: string; id?: string };

// Shared UI for the two v2 gap #10 masters (Saree Colour, Jari Code) —
// identical shape and CRUD pattern, only the Server Actions passed in
// differ. See src/lib/actions/codeNameMasters.ts.
export function CodeNameMasterClient({
  rows,
  addLabel,
  codeLabel,
  nameLabel,
  createAction,
  updateAction,
  toggleAction,
}: {
  rows: CodeNameRow[];
  addLabel: string;
  codeLabel: string;
  nameLabel: string;
  createAction: (input: { code: string; name: string }) => Promise<ActionResult>;
  updateAction: (id: string, input: { code: string; name: string }) => Promise<ActionResult>;
  toggleAction: (id: string, isActive: boolean) => Promise<ActionResult>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CodeNameRow | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setCode('');
    setName('');
    setModalOpen(true);
  }
  function openEdit(row: CodeNameRow) {
    setEditing(row);
    setCode(row.code);
    setName(row.name);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = editing ? await updateAction(editing.id, { code, name }) : await createAction({ code, name });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(editing ? 'Saved' : 'Added');
    setModalOpen(false);
  }

  async function toggleActive(row: CodeNameRow) {
    const result = await toggleAction(row.id, !row.isActive);
    if (result.error) toast.error(result.error);
  }

  return (
    <div>
      <div className="flex justify-end">
        <PrimaryButton onClick={openCreate} className="flex items-center gap-1.5">
          <Plus size={16} /> {addLabel}
        </PrimaryButton>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-mono font-medium text-ink">{r.code}</td>
                <td className="px-4 py-3 text-ink/70">{r.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.isActive ? 'bg-green-100 text-green-700' : 'bg-ink/10 text-ink/50'
                    }`}
                  >
                    {r.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(r)} className="text-ink/50 hover:text-ink" title="Edit">
                    <Pencil size={16} className="inline" />
                  </button>
                  <button onClick={() => toggleActive(r)} className="ml-3 text-sm text-ink/50 hover:underline">
                    {r.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink/40">
                  None yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing.code}` : addLabel}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label={codeLabel}>
            <TextInput required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label={nameLabel}>
            <TextInput required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

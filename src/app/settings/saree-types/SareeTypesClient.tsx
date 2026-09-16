'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { createSareeType, updateSareeType, setSareeTypeActive } from '@/lib/actions/sareeTypes';
import { Plus, Pencil } from 'lucide-react';

type ItemGroup = 'SAREE' | 'DHOTI' | 'WASTE' | 'OTHER';

type SareeType = {
  id: string;
  name: string;
  alternateNames: string[];
  itemGroup: ItemGroup;
  hsnCode: string | null;
  jariPerSaree: string;
  weftGramsPerSaree: string;
  costPrice: string | null;
  isActive: boolean;
};

const ITEM_GROUP_LABELS: Record<ItemGroup, string> = {
  SAREE: 'Saree',
  DHOTI: 'Dhoti',
  WASTE: 'Waste / Cut piece',
  OTHER: 'Other',
};

const emptyForm = {
  name: '',
  alternateNames: '',
  itemGroup: 'SAREE' as ItemGroup,
  hsnCode: '',
  jariPerSaree: '',
  weftGramsPerSaree: '280',
  costPrice: '',
};

export function SareeTypesClient({ sareeTypes }: { sareeTypes: SareeType[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SareeType | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(st: SareeType) {
    setEditing(st);
    setForm({
      name: st.name,
      alternateNames: st.alternateNames.join(', '),
      itemGroup: st.itemGroup,
      hsnCode: st.hsnCode ?? '',
      jariPerSaree: st.jariPerSaree,
      weftGramsPerSaree: st.weftGramsPerSaree,
      costPrice: st.costPrice ?? '',
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      alternateNames: form.alternateNames
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      itemGroup: form.itemGroup,
      hsnCode: form.hsnCode,
      jariPerSaree: form.jariPerSaree || '0',
      weftGramsPerSaree: form.weftGramsPerSaree || '0',
      costPrice: form.costPrice || undefined,
    };
    const result = editing ? await updateSareeType(editing.id, payload) : await createSareeType(payload);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(editing ? 'Saree type updated' : 'Saree type added');
    setModalOpen(false);
  }

  async function toggleActive(st: SareeType) {
    const result = await setSareeTypeActive(st.id, !st.isActive);
    if (result.error) toast.error(result.error);
  }

  return (
    <div>
      <div className="flex justify-end">
        <PrimaryButton onClick={openCreate} className="flex items-center gap-1.5">
          <Plus size={16} /> Add saree type
        </PrimaryButton>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">Alternate names</th>
              <th className="px-4 py-3">HSN/SAC</th>
              <th className="px-4 py-3">Jari / saree</th>
              <th className="px-4 py-3">Weft (g) / saree</th>
              <th className="px-4 py-3">Cost price</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sareeTypes.map((st) => (
              <tr key={st.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">{st.name}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                    {ITEM_GROUP_LABELS[st.itemGroup]}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink/70">{st.alternateNames.join(', ') || '—'}</td>
                <td className="px-4 py-3 text-ink/70">{st.hsnCode ?? '—'}</td>
                <td className="px-4 py-3 text-ink/70">{st.jariPerSaree}</td>
                <td className="px-4 py-3 text-ink/70">{st.weftGramsPerSaree}</td>
                <td className="px-4 py-3 text-ink/70">{st.costPrice ? `₹${Number(st.costPrice).toLocaleString('en-IN')}` : '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      st.isActive ? 'bg-green-100 text-green-700' : 'bg-ink/10 text-ink/50'
                    }`}
                  >
                    {st.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(st)} className="text-ink/50 hover:text-ink" title="Edit">
                    <Pencil size={16} className="inline" />
                  </button>
                  <button onClick={() => toggleActive(st)} className="ml-3 text-sm text-ink/50 hover:underline">
                    {st.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {sareeTypes.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-ink/40">
                  No saree types yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add saree type'}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Name">
            <TextInput
              required
              placeholder="e.g. Bodi, Border, Tissue…"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Alternate names (comma-separated)">
            <TextInput
              placeholder="e.g. Brocade, Brocket"
              value={form.alternateNames}
              onChange={(e) => setForm({ ...form, alternateNames: e.target.value })}
            />
          </Field>
          <Field label="Item group">
            <Select value={form.itemGroup} onChange={(e) => setForm({ ...form, itemGroup: e.target.value as ItemGroup })}>
              {(Object.keys(ITEM_GROUP_LABELS) as ItemGroup[]).map((g) => (
                <option key={g} value={g}>
                  {ITEM_GROUP_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
          {form.itemGroup !== 'SAREE' && (
            <p className="text-xs text-ink/50">
              Jari/Weft consumption rates only apply to the Saree group — leave them at 0 for {ITEM_GROUP_LABELS[form.itemGroup].toLowerCase()}.
            </p>
          )}
          <Field label="HSN/SAC code (optional, for GST bills)">
            <TextInput
              placeholder="e.g. 5007"
              value={form.hsnCode}
              onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
            />
          </Field>
          <Field label="Jari consumption per saree (Nos)">
            <TextInput
              type="number"
              step="0.001"
              min="0"
              value={form.jariPerSaree}
              onChange={(e) => setForm({ ...form, jariPerSaree: e.target.value })}
            />
          </Field>
          <Field label="Weft consumption per saree (grams)">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.weftGramsPerSaree}
              onChange={(e) => setForm({ ...form, weftGramsPerSaree: e.target.value })}
            />
          </Field>
          <Field label="Cost price (₹, optional — for stock valuation)">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.costPrice}
              onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add saree type'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { createRawMaterial, updateRawMaterial } from '@/lib/actions/rawMaterials';
import { Plus, Pencil } from 'lucide-react';

type Category = 'WARP' | 'WEFT' | 'JARI' | 'DYE' | 'ELECTRONICS' | 'OTHER';

type RawMaterial = {
  id: string;
  name: string;
  category: Category;
  unit: string;
  hsnCode: string | null;
  currentStock: string;
  lowStockLevel: string | null;
};

const CATEGORY_LABELS: Record<Category, string> = {
  WARP: 'Warp',
  WEFT: 'Weft',
  JARI: 'Jari',
  DYE: 'Dye',
  ELECTRONICS: 'Electronics',
  OTHER: 'Other',
};

const emptyForm = { name: '', category: 'OTHER' as Category, unit: '', hsnCode: '', lowStockLevel: '' };

export function RawMaterialsClient({ rawMaterials }: { rawMaterials: RawMaterial[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(rm: RawMaterial) {
    setEditing(rm);
    setForm({
      name: rm.name,
      category: rm.category,
      unit: rm.unit,
      hsnCode: rm.hsnCode ?? '',
      lowStockLevel: rm.lowStockLevel ?? '',
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = editing ? await updateRawMaterial(editing.id, form) : await createRawMaterial(form);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(editing ? 'Raw material updated' : 'Raw material added');
    setModalOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="max-w-md text-sm text-ink/60">
          Current stock is transaction-driven (purchases, issues, adjustments) — not editable here.
        </p>
        <PrimaryButton onClick={openCreate} className="flex shrink-0 items-center gap-1.5">
          <Plus size={16} /> Add raw material
        </PrimaryButton>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">HSN/SAC</th>
              <th className="px-4 py-3">Current Stock</th>
              <th className="px-4 py-3">Low Stock Level</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rawMaterials.map((rm) => (
              <tr key={rm.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">{rm.name}</td>
                <td className="px-4 py-3 text-ink/70">{CATEGORY_LABELS[rm.category]}</td>
                <td className="px-4 py-3 text-ink/70">{rm.unit}</td>
                <td className="px-4 py-3 text-ink/70">{rm.hsnCode ?? '—'}</td>
                <td className="px-4 py-3 text-ink/70">{rm.currentStock}</td>
                <td className="px-4 py-3 text-ink/70">{rm.lowStockLevel ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(rm)} className="text-ink/50 hover:text-ink" title="Edit">
                    <Pencil size={16} className="inline" />
                  </button>
                </td>
              </tr>
            ))}
            {rawMaterials.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink/40">
                  No raw materials yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add raw material'}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Name">
            <TextInput
              required
              placeholder="e.g. Silk Warp, Weft, Jari…"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Category">
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
            >
              <option value="WARP">Warp</option>
              <option value="WEFT">Weft</option>
              <option value="JARI">Jari</option>
              <option value="DYE">Dye</option>
              <option value="ELECTRONICS">Electronics</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Unit">
            <TextInput
              required
              placeholder={form.category === 'WARP' ? 'Nos' : form.category === 'WEFT' ? 'Kg' : 'e.g. Nos, Kg, Litre'}
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </Field>
          <Field label="HSN/SAC code (optional, for GST bills)">
            <TextInput
              placeholder="e.g. 5004"
              value={form.hsnCode}
              onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
            />
          </Field>
          <Field label="Low stock alert level (optional)">
            <TextInput
              type="number"
              step="0.001"
              min="0"
              value={form.lowStockLevel}
              onChange={(e) => setForm({ ...form, lowStockLevel: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add raw material'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

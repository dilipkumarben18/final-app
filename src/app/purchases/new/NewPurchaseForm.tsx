'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, TextArea, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { createPurchase } from '@/lib/actions/purchases';
import { createRawMaterial } from '@/lib/actions/rawMaterials';

type Option = { id: string; name: string };
type RawMaterialOption = { id: string; name: string; unit: string };
type BranchOption = { id: string; name: string; address: string | null };
type PartyOption = { id: string; name: string; branches: BranchOption[] };

type LineItem = { rawMaterialId: string; quantity: string; rate: string };
type NewMaterialCategory = 'WARP' | 'WEFT' | 'JARI' | 'DYE' | 'ELECTRONICS' | 'OTHER';

const ADD_NEW = '__add_new__';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function NewPurchaseForm({
  firms,
  parties,
  rawMaterials,
}: {
  firms: Option[];
  parties: PartyOption[];
  rawMaterials: RawMaterialOption[];
}) {
  const router = useRouter();
  const [purchaseType, setPurchaseType] = useState<'WITH_INVOICE' | 'WITHOUT_INVOICE'>('WITH_INVOICE');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [firmId, setFirmId] = useState(firms[0]?.id ?? '');
  const [partyId, setPartyId] = useState(parties[0]?.id ?? '');
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [gstRatePercent, setGstRatePercent] = useState('5');
  const [lrNumber, setLrNumber] = useState('');
  const [ewayBillNumber, setEwayBillNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([
    { rawMaterialId: rawMaterials[0]?.id ?? '', quantity: '', rate: '' },
  ]);
  const [saving, setSaving] = useState(false);

  const [materialOptions, setMaterialOptions] = useState(rawMaterials);
  const [addMaterialForLine, setAddMaterialForLine] = useState<number | null>(null);
  const [newMaterialName, setNewMaterialName] = useState('');
  const [newMaterialCategory, setNewMaterialCategory] = useState<NewMaterialCategory>('OTHER');
  const [newMaterialUnit, setNewMaterialUnit] = useState('');
  const [addingMaterial, setAddingMaterial] = useState(false);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function handleRawMaterialSelect(index: number, value: string) {
    if (value === ADD_NEW) {
      setNewMaterialName('');
      setNewMaterialCategory('OTHER');
      setNewMaterialUnit('');
      setAddMaterialForLine(index);
      return;
    }
    updateItem(index, { rawMaterialId: value });
  }

  async function handleAddMaterialSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAddingMaterial(true);
    const result = await createRawMaterial({
      name: newMaterialName,
      category: newMaterialCategory,
      unit: newMaterialUnit,
    });
    setAddingMaterial(false);
    if (result.error || !result.id) {
      toast.error(result.error ?? 'Could not add raw material.');
      return;
    }
    const created = { id: result.id, name: newMaterialName, unit: newMaterialUnit };
    setMaterialOptions((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    if (addMaterialForLine !== null) updateItem(addMaterialForLine, { rawMaterialId: created.id });
    toast.success('Raw material added');
    setAddMaterialForLine(null);
  }

  function addItem() {
    setItems((prev) => [...prev, { rawMaterialId: materialOptions[0]?.id ?? '', quantity: '', rate: '' }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0),
    [items]
  );
  const gstAmount = useMemo(() => (subtotal * (Number(gstRatePercent) || 0)) / 100, [subtotal, gstRatePercent]);
  const total = subtotal + gstAmount;

  const selectedParty = parties.find((p) => p.id === partyId);
  const selectedBranch = selectedParty?.branches.find((b) => b.id === branchId);

  function handlePartyChange(id: string) {
    setPartyId(id);
    setBranchId('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await createPurchase({
      purchaseType,
      invoiceNumber,
      firmId,
      partyId,
      branchId: branchId || undefined,
      date,
      gstRatePercent,
      lrNumber,
      ewayBillNumber,
      notes,
      items,
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Purchase saved');
    router.push('/purchases');
  }

  if (firms.length === 0 || parties.length === 0) {
    return (
      <p className="text-sm text-ink/60">
        You need at least one active Firm and one Purchase/Both Party before recording a purchase. Set these up
        under Settings and Parties first.
      </p>
    );
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Purchase type">
        <Select
          value={purchaseType}
          onChange={(e) => setPurchaseType(e.target.value as 'WITH_INVOICE' | 'WITHOUT_INVOICE')}
        >
          <option value="WITH_INVOICE">With Invoice</option>
          <option value="WITHOUT_INVOICE">Without Invoice (local/no-bill supplier)</option>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={purchaseType === 'WITHOUT_INVOICE' ? 'Invoice number (optional)' : "Invoice number (from supplier's bill)"}>
          <TextInput
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            required={purchaseType === 'WITH_INVOICE'}
          />
        </Field>
        <Field label="Date">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Firm">
          <Select value={firmId} onChange={(e) => setFirmId(e.target.value)} required>
            {firms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Party (supplier)">
          <Select value={partyId} onChange={(e) => handlePartyChange(e.target.value)} required>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {selectedParty && selectedParty.branches.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Branch (optional)">
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">No branch</option>
              {selectedParty.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          {selectedBranch && (
            <Field label="Branch address">
              <p className="rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-2 text-sm text-ink/70">
                {selectedBranch.address || '—'}
              </p>
            </Field>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field label="GST rate %">
          <TextInput
            type="number"
            step="0.01"
            value={gstRatePercent}
            onChange={(e) => setGstRatePercent(e.target.value)}
          />
        </Field>
        <Field label="LR number (optional)">
          <TextInput value={lrNumber} onChange={(e) => setLrNumber(e.target.value)} />
        </Field>
        <Field label="E-Way Bill number (optional)">
          <TextInput value={ewayBillNumber} onChange={(e) => setEwayBillNumber(e.target.value)} />
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-ink/80">Line items</label>
          <button type="button" onClick={addItem} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
            <Plus size={14} /> Add line
          </button>
        </div>

        <div className="mt-2 space-y-2">
          {items.map((item, i) => {
            const rm = materialOptions.find((r) => r.id === item.rawMaterialId);
            return (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <div className="col-span-5">
                  <Select
                    value={item.rawMaterialId}
                    onChange={(e) => handleRawMaterialSelect(i, e.target.value)}
                    required
                  >
                    {materialOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                    <option value={ADD_NEW}>+ Add new raw material…</option>
                  </Select>
                </div>
                <div className="col-span-3">
                  <TextInput
                    type="number"
                    step="0.001"
                    placeholder={`Qty${rm ? ` (${rm.unit === 'KG' ? 'kg' : 'count'})` : ''}`}
                    value={item.quantity}
                    onChange={(e) => updateItem(i, { quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="col-span-3">
                  <TextInput
                    type="number"
                    step="0.01"
                    placeholder="Rate"
                    value={item.rate}
                    onChange={(e) => updateItem(i, { rate: e.target.value })}
                    required
                  />
                </div>
                <div className="col-span-1 text-right">
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="text-ink/40 hover:text-red-600">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Field label="Notes">
        <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 text-sm">
        <div className="flex justify-between text-ink/70">
          <span>Subtotal</span>
          <span>₹{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-ink/70">
          <span>GST ({gstRatePercent || 0}%)</span>
          <span>₹{gstAmount.toFixed(2)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-brand-100 pt-1 font-semibold text-ink">
          <span>Total</span>
          <span>₹{total.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <SecondaryButton type="button" onClick={() => router.push('/purchases')}>
          Cancel
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save purchase'}
        </PrimaryButton>
      </div>
    </form>

    <Modal open={addMaterialForLine !== null} onClose={() => setAddMaterialForLine(null)} title="Add new raw material">
      <form onSubmit={handleAddMaterialSubmit} className="space-y-3">
        <Field label="Name">
          <TextInput
            required
            placeholder="e.g. Silk Warp, Weft, Jari…"
            value={newMaterialName}
            onChange={(e) => setNewMaterialName(e.target.value)}
          />
        </Field>
        <Field label="Category">
          <Select
            value={newMaterialCategory}
            onChange={(e) => setNewMaterialCategory(e.target.value as NewMaterialCategory)}
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
            placeholder={newMaterialCategory === 'WARP' ? 'Nos' : newMaterialCategory === 'WEFT' ? 'Kg' : 'e.g. Nos, Kg, Litre'}
            value={newMaterialUnit}
            onChange={(e) => setNewMaterialUnit(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <SecondaryButton type="button" onClick={() => setAddMaterialForLine(null)}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={addingMaterial}>
            {addingMaterial ? 'Adding…' : 'Add raw material'}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
    </>
  );
}

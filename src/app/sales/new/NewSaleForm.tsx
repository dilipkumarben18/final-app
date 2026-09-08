'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Field, TextInput, TextArea, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { createSale } from '@/lib/actions/sales';

type Option = { id: string; name: string };
type BranchOption = { id: string; name: string; address: string | null };
type PartyOption = { id: string; name: string; branches: BranchOption[] };

type LineItem = { sareeTypeId: string; quantity: string; rate: string };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function NewSaleForm({
  firms,
  parties,
  sareeTypes,
  homeLocations,
}: {
  firms: Option[];
  parties: PartyOption[];
  sareeTypes: Option[];
  homeLocations: Option[];
}) {
  const router = useRouter();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [firmId, setFirmId] = useState(firms[0]?.id ?? '');
  const [partyId, setPartyId] = useState(parties[0]?.id ?? '');
  const [branchId, setBranchId] = useState('');
  const [isOpeningEntry, setIsOpeningEntry] = useState(false);
  const [locationId, setLocationId] = useState(homeLocations[0]?.id ?? '');
  const [date, setDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState('');
  const [gstRatePercent, setGstRatePercent] = useState('5');
  const [ewayBillNumber, setEwayBillNumber] = useState('');
  const [courierLrNumber, setCourierLrNumber] = useState('');
  const [courierCharges, setCourierCharges] = useState('');
  const [freightStatus, setFreightStatus] = useState<'' | 'PAID' | 'TO_PAY'>('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([
    { sareeTypeId: sareeTypes[0]?.id ?? '', quantity: '', rate: '' },
  ]);
  const [saving, setSaving] = useState(false);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { sareeTypeId: sareeTypes[0]?.id ?? '', quantity: '', rate: '' }]);
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
    const result = await createSale({
      invoiceNumber,
      firmId,
      partyId,
      branchId: branchId || undefined,
      isOpeningEntry,
      locationId: isOpeningEntry ? undefined : locationId,
      date,
      dueDate: dueDate || undefined,
      gstRatePercent,
      ewayBillNumber,
      courierLrNumber,
      courierCharges: courierCharges || undefined,
      freightStatus: freightStatus || undefined,
      notes,
      items,
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Sale saved');
    router.push('/sales');
  }

  if (firms.length === 0 || parties.length === 0) {
    return (
      <p className="text-sm text-ink/60">
        You need at least one active Firm and one Sales/Both Party before recording a sale. Set these up under
        Settings and Parties first.
      </p>
    );
  }


  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Invoice number (from your bill copy)">
          <TextInput value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required />
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
        <Field label="Party (customer)">
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

      <label className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-2 text-sm text-ink/80">
        <input
          type="checkbox"
          checked={isOpeningEntry}
          onChange={(e) => setIsOpeningEntry(e.target.checked)}
          className="h-4 w-4 rounded border-brand-200"
        />
        Opening / historical entry — a past bill entered for the record and party balance only, won&apos;t touch
        saree stock
      </label>

      <div className="grid grid-cols-2 gap-3">
        {!isOpeningEntry && (
          <Field label="Sell from (Home stock)">
            {homeLocations.length === 0 ? (
              <p className="text-xs text-ink/50">
                No active Home stock location — set one up under Settings, or check &quot;Opening / historical
                entry&quot; above.
              </p>
            ) : (
              <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
                {homeLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="GST rate %">
          <TextInput
            type="number"
            step="0.01"
            value={gstRatePercent}
            onChange={(e) => setGstRatePercent(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Due date (optional)">
        <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="E-Way Bill number (optional)">
          <TextInput value={ewayBillNumber} onChange={(e) => setEwayBillNumber(e.target.value)} />
        </Field>
        <Field label="Courier / LR number (optional)">
          <TextInput value={courierLrNumber} onChange={(e) => setCourierLrNumber(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Courier charges (optional)">
          <TextInput
            type="number"
            step="0.01"
            min="0"
            value={courierCharges}
            onChange={(e) => setCourierCharges(e.target.value)}
          />
        </Field>
        <Field label="Freight status">
          <Select value={freightStatus} onChange={(e) => setFreightStatus(e.target.value as typeof freightStatus)}>
            <option value="">Not applicable</option>
            <option value="PAID">Paid</option>
            <option value="TO_PAY">To Pay</option>
          </Select>
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
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2">
              <div className="col-span-5">
                <Select
                  value={item.sareeTypeId}
                  onChange={(e) => updateItem(i, { sareeTypeId: e.target.value })}
                  required
                >
                  {sareeTypes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="col-span-3">
                <TextInput
                  type="number"
                  min={1}
                  placeholder="Qty"
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
          ))}
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
        <SecondaryButton type="button" onClick={() => router.push('/sales')}>
          Cancel
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save sale'}
        </PrimaryButton>
      </div>
    </form>
  );
}

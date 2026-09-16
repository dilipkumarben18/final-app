'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, TextArea, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import {
  recordMaterialIssuedToWeaver,
  recordWeaverWage,
  recordWeaverPayment,
  recordWeaverAdjustment,
} from '@/lib/actions/weaverLedger';

export type WeaverLedgerRow = { date: string; type: string; label: string; amount: number; balance: number };
type SareeTypeOption = { id: string; name: string };
type WageOption = { id: string; label: string };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function formatMoney(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

type ModalKind = 'material' | 'wage' | 'payment' | 'adjustment' | null;

export function WeaverLedgerClient({
  weaverId,
  balance,
  entries,
  sareeTypes,
  wageOptions,
}: {
  weaverId: string;
  balance: number;
  entries: WeaverLedgerRow[];
  sareeTypes: SareeTypeOption[];
  wageOptions: WageOption[];
}) {
  const [openModal, setOpenModal] = useState<ModalKind>(null);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState('');

  const [sareeTypeId, setSareeTypeId] = useState(sareeTypes[0]?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [rate, setRate] = useState('');

  const [weaverWageId, setWeaverWageId] = useState('');
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');

  const [direction, setDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT');

  function openFor(kind: ModalKind) {
    setAmount('');
    setDate(todayStr());
    setNotes('');
    setSareeTypeId(sareeTypes[0]?.id ?? '');
    setQuantity('');
    setRate('');
    setWeaverWageId('');
    setMethod('');
    setReference('');
    setDirection('CREDIT');
    setOpenModal(kind);
  }

  async function submitMaterial(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await recordMaterialIssuedToWeaver({ weaverId, amount, date, notes });
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success('Material debit recorded');
    setOpenModal(null);
  }

  async function submitWage(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await recordWeaverWage({ weaverId, sareeTypeId: sareeTypeId || undefined, quantity, rate, date, notes });
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success('Wage recorded');
    setOpenModal(null);
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await recordWeaverPayment({
      weaverId,
      weaverWageId: weaverWageId || undefined,
      amount,
      date,
      method,
      reference,
      notes,
    });
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success('Payment recorded');
    setOpenModal(null);
  }

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await recordWeaverAdjustment({ weaverId, direction, amount, date, notes });
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success('Adjustment recorded');
    setOpenModal(null);
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-ink">Ledger</h3>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={() => openFor('material')}>Record Material Issued</SecondaryButton>
          <SecondaryButton onClick={() => openFor('wage')}>Record Wage</SecondaryButton>
          <SecondaryButton onClick={() => openFor('payment')}>Record Payment</SecondaryButton>
          <SecondaryButton onClick={() => openFor('adjustment')}>Adjustment</SecondaryButton>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-brand-100 bg-white p-4">
        <p className="text-xs uppercase text-ink/40">Current balance</p>
        {balance === 0 ? (
          <p className="mt-1 text-xl font-semibold text-ink/50">Settled</p>
        ) : balance > 0 ? (
          <p className="mt-1 text-xl font-semibold text-green-700">₹{formatMoney(balance)} owed to weaver</p>
        ) : (
          <p className="mt-1 text-xl font-semibold text-red-600">₹{formatMoney(-balance)} advanced to weaver</p>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className="border-t border-brand-50">
                <td className="px-4 py-3 text-ink/70">{new Date(e.date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-ink">{e.type}</td>
                <td className="px-4 py-3 text-ink/70">{e.label}</td>
                <td className={`px-4 py-3 text-right font-medium ${e.amount >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {e.amount >= 0 ? '+' : '−'}₹{formatMoney(Math.abs(e.amount))}
                </td>
                <td className="px-4 py-3 text-right text-ink/70">₹{formatMoney(e.balance)}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink/40">
                  No ledger entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={openModal === 'material'} onClose={() => setOpenModal(null)} title="Record material issued">
        <form onSubmit={submitMaterial} className="space-y-3">
          <Field label="Value of material issued (₹)">
            <TextInput type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Notes">
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was issued…" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setOpenModal(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Record'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal open={openModal === 'wage'} onClose={() => setOpenModal(null)} title="Record wage">
        <form onSubmit={submitWage} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Saree type (optional)">
              <Select value={sareeTypeId} onChange={(e) => setSareeTypeId(e.target.value)}>
                <option value="">Not specified</option>
                {sareeTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Quantity">
              <TextInput type="number" min={1} step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </Field>
            <Field label="Rate (₹ per saree)">
              <TextInput type="number" min={0.01} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required />
            </Field>
          </div>
          {quantity && rate && (
            <p className="text-xs text-ink/50">
              Amount: ₹{formatMoney((Number(quantity) || 0) * (Number(rate) || 0))}
            </p>
          )}
          <Field label="Notes">
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setOpenModal(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Record'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal open={openModal === 'payment'} onClose={() => setOpenModal(null)} title="Record payment to weaver">
        <form onSubmit={submitPayment} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹)">
              <TextInput type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
            <Field label="Date">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
          </div>
          {wageOptions.length > 0 && (
            <Field label="Against a specific wage entry (optional)">
              <Select value={weaverWageId} onChange={(e) => setWeaverWageId(e.target.value)}>
                <option value="">Not linked to a specific entry</option>
                {wageOptions.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method">
              <TextInput placeholder="Cash, UPI, Bank transfer…" value={method} onChange={(e) => setMethod(e.target.value)} />
            </Field>
            <Field label="Reference">
              <TextInput placeholder="Cheque no., UTR, etc." value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes">
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setOpenModal(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Record payment'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal open={openModal === 'adjustment'} onClose={() => setOpenModal(null)} title="Ledger adjustment">
        <form onSubmit={submitAdjustment} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Direction">
              <Select value={direction} onChange={(e) => setDirection(e.target.value as 'CREDIT' | 'DEBIT')} required>
                <option value="CREDIT">Credit (increase owed to weaver)</option>
                <option value="DEBIT">Debit (decrease owed to weaver)</option>
              </Select>
            </Field>
            <Field label="Amount (₹)">
              <TextInput type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
          </div>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Notes (required)">
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} required />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setOpenModal(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Record adjustment'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

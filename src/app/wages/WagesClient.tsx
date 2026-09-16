'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { recordWeaverWage, recordWeaverPayment } from '@/lib/actions/weaverLedger';

type SareeTypeRate = { id: string; name: string; ratePerSaree: string };
type Weaver = { id: string; name: string; balance: number; sareeTypes: SareeTypeRate[] };
type CompletedWarp = {
  id: string;
  weaverId: string;
  weaverName: string;
  sareeTypeId: string;
  sareeTypeName: string;
  completedAt: string;
};
type RecentWage = {
  id: string;
  weaverName: string;
  sareeTypeName: string | null;
  quantity: number;
  rate: string;
  amount: string;
  date: string;
  isFullWarp: boolean;
};
type RecentPayment = { id: string; weaverName: string; amount: string; date: string; method: string | null };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function formatMoney(n: number | string) {
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

type WageModalState =
  | { mode: 'warp'; warp: CompletedWarp }
  | { mode: 'manual'; weaverId: string }
  | null;

export function WagesClient({
  weavers,
  completedUnpaidWarps,
  recentWages,
  recentPayments,
}: {
  weavers: Weaver[];
  completedUnpaidWarps: CompletedWarp[];
  recentWages: RecentWage[];
  recentPayments: RecentPayment[];
}) {
  const router = useRouter();
  const [wageModal, setWageModal] = useState<WageModalState>(null);
  const [paymentFor, setPaymentFor] = useState<Weaver | null>(null);
  const [saving, setSaving] = useState(false);

  const [weaverId, setWeaverId] = useState('');
  const [sareeTypeId, setSareeTypeId] = useState('');
  const [quantity, setQuantity] = useState('24');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState('');

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayStr());
  const [paymentMethod, setPaymentMethod] = useState('');

  function rateFor(wId: string, stId: string) {
    return weavers.find((w) => w.id === wId)?.sareeTypes.find((s) => s.id === stId)?.ratePerSaree ?? '';
  }

  function openForWarp(warp: CompletedWarp) {
    setWageModal({ mode: 'warp', warp });
    setWeaverId(warp.weaverId);
    setSareeTypeId(warp.sareeTypeId);
    setQuantity('24');
    setRate(rateFor(warp.weaverId, warp.sareeTypeId));
    setDate(todayStr());
    setNotes('');
  }

  function openManual(w: Weaver) {
    setWageModal({ mode: 'manual', weaverId: w.id });
    setWeaverId(w.id);
    const firstType = w.sareeTypes[0];
    setSareeTypeId(firstType?.id ?? '');
    setQuantity('24');
    setRate(firstType?.ratePerSaree ?? '');
    setDate(todayStr());
    setNotes('');
  }

  const amount = (Number(quantity) || 0) * (Number(rate) || 0);

  async function handleWageSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await recordWeaverWage({
      weaverId,
      sareeTypeId: sareeTypeId || undefined,
      warpAssignmentId: wageModal?.mode === 'warp' ? wageModal.warp.id : undefined,
      quantity,
      rate,
      date,
      notes,
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Wage recorded');
    setWageModal(null);
    router.refresh();
  }

  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentFor) return;
    setSaving(true);
    const result = await recordWeaverPayment({
      weaverId: paymentFor.id,
      amount: paymentAmount,
      date: paymentDate,
      method: paymentMethod || undefined,
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Payment recorded');
    setPaymentFor(null);
    setPaymentAmount('');
    setPaymentMethod('');
    router.refresh();
  }

  const activeWeaver = weavers.find((w) => w.id === weaverId);

  return (
    <div className="space-y-6">
      {completedUnpaidWarps.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-display text-base font-semibold text-ink">
            {completedUnpaidWarps.length} completed warp{completedUnpaidWarps.length === 1 ? '' : 's'} not yet paid
          </h2>
          <div className="mt-3 space-y-2">
            {completedUnpaidWarps.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5">
                <div>
                  <span className="font-medium text-ink">{w.weaverName}</span>
                  <span className="text-ink/60"> — {w.sareeTypeName}, 24 sarees, completed {new Date(w.completedAt).toLocaleDateString()}</span>
                </div>
                <PrimaryButton onClick={() => openForWarp(w)}>Pay for this warp</PrimaryButton>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Weaver</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {weavers.map((w) => (
              <tr key={w.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">{w.name}</td>
                <td className="px-4 py-3">
                  {w.balance > 0 && <span className="text-green-700">Owed ₹{formatMoney(w.balance)}</span>}
                  {w.balance < 0 && <span className="text-amber-600">Advance ₹{formatMoney(-w.balance)}</span>}
                  {w.balance === 0 && <span className="text-ink/40">Settled</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <SecondaryButton onClick={() => openManual(w)}>Record wage</SecondaryButton>
                    <SecondaryButton onClick={() => setPaymentFor(w)}>Record payment</SecondaryButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <h2 className="font-display text-base font-semibold text-ink">Recent wages</h2>
          <div className="mt-3 max-h-80 overflow-auto text-sm">
            {recentWages.length === 0 && <p className="text-ink/50">No wages recorded yet.</p>}
            {recentWages.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-t border-brand-50 py-2 first:border-t-0">
                <div>
                  <span className="font-medium text-ink">{r.weaverName}</span>
                  <span className="text-ink/60">
                    {' '}
                    — {r.quantity} × ₹{formatMoney(r.rate)}
                    {r.sareeTypeName ? ` (${r.sareeTypeName})` : ''}
                    {r.isFullWarp ? ' · full warp' : ''}
                  </span>
                </div>
                <span className="font-medium text-ink">₹{formatMoney(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <h2 className="font-display text-base font-semibold text-ink">Recent payments</h2>
          <div className="mt-3 max-h-80 overflow-auto text-sm">
            {recentPayments.length === 0 && <p className="text-ink/50">No payments recorded yet.</p>}
            {recentPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-t border-brand-50 py-2 first:border-t-0">
                <div>
                  <span className="font-medium text-ink">{p.weaverName}</span>
                  {p.method && <span className="text-ink/60"> — {p.method}</span>}
                </div>
                <span className="font-medium text-ink">₹{formatMoney(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={!!wageModal} onClose={() => setWageModal(null)} title="Record wage">
        <form onSubmit={handleWageSubmit} className="space-y-4">
          {wageModal?.mode === 'manual' && (
            <Field label="Saree type">
              <Select
                value={sareeTypeId}
                onChange={(e) => {
                  setSareeTypeId(e.target.value);
                  setRate(rateFor(weaverId, e.target.value));
                }}
              >
                <option value="">—</option>
                {activeWeaver?.sareeTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity (sarees)">
              <TextInput type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </Field>
            <Field label="Rate per saree">
              <TextInput type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required />
            </Field>
          </div>
          <p className="text-sm text-ink/60">
            Amount: <span className="font-medium text-ink">₹{formatMoney(amount)}</span>
          </p>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <div className="flex justify-end gap-2">
            <SecondaryButton type="button" onClick={() => setWageModal(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save wage'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal open={!!paymentFor} onClose={() => setPaymentFor(null)} title={`Record payment — ${paymentFor?.name ?? ''}`}>
        <form onSubmit={handlePaymentSubmit} className="space-y-4">
          <Field label="Amount">
            <TextInput type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required />
          </Field>
          {paymentFor && paymentAmount && Number(paymentAmount) > paymentFor.balance && paymentFor.balance >= 0 && (
            <p className="text-xs text-amber-600">
              This pays off the full ₹{formatMoney(paymentFor.balance)} owed and gives an advance of ₹
              {formatMoney(Number(paymentAmount) - paymentFor.balance)}.
            </p>
          )}
          <Field label="Date">
            <TextInput type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
          </Field>
          <Field label="Method (optional)">
            <TextInput value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Cash, UPI..." />
          </Field>
          <div className="flex justify-end gap-2">
            <SecondaryButton type="button" onClick={() => setPaymentFor(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save payment'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

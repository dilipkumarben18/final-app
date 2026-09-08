'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select, TextArea, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { recordPayment } from '@/lib/actions/payments';

type PartyType = 'PURCHASE' | 'SALES' | 'BOTH' | 'TRANSPORTER' | 'DYEING' | 'AGENT' | 'JOB_WORKER';
type PartyRow = { id: string; name: string; type: PartyType; balance: number };

// Parties we typically owe money to — payment direction defaults to PAID
// for these, RECEIVED for SALES/BOTH.
const PAYABLE_PARTY_TYPES: PartyType[] = ['PURCHASE', 'TRANSPORTER', 'DYEING', 'AGENT', 'JOB_WORKER'];
type PaymentRow = {
  id: string;
  partyName: string;
  direction: 'PAID' | 'RECEIVED';
  amount: string;
  date: string;
  method: string | null;
  reference: string | null;
  purchaseNumber: string | null;
  saleInvoiceNumber: string | null;
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function PaymentsClient({ parties, recentPayments }: { parties: PartyRow[]; recentPayments: PaymentRow[] }) {
  const [open, setOpen] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [direction, setDirection] = useState<'PAID' | 'RECEIVED'>('RECEIVED');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  function openFor(p?: PartyRow) {
    const target = p ?? parties[0];
    setPartyId(target?.id ?? '');
    setDirection(target && PAYABLE_PARTY_TYPES.includes(target.type) ? 'PAID' : 'RECEIVED');
    setAmount('');
    setDate(todayStr());
    setMethod('');
    setReference('');
    setNotes('');
    setOpen(true);
  }

  function handlePartyChange(id: string) {
    setPartyId(id);
    const p = parties.find((x) => x.id === id);
    if (p && PAYABLE_PARTY_TYPES.includes(p.type)) setDirection('PAID');
    else if (p?.type === 'SALES' || p?.type === 'BOTH') setDirection('RECEIVED');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await recordPayment({ partyId, direction, amount, date, method, reference, notes });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Payment recorded');
    setOpen(false);
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <PrimaryButton onClick={() => openFor()} disabled={parties.length === 0}>
          Record Payment
        </PrimaryButton>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {parties.map((p) => (
              <tr key={p.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">
                  <Link href={`/payments/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink/70">{p.type}</td>
                <td className="px-4 py-3">
                  {p.balance === 0 ? (
                    <span className="text-ink/40">Settled</span>
                  ) : p.balance > 0 ? (
                    <span className="font-medium text-green-700">₹{formatMoney(p.balance)} owed to you</span>
                  ) : (
                    <span className="font-medium text-red-600">₹{formatMoney(-p.balance)} you owe</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openFor(p)} className="text-brand-700 hover:underline">
                    Record Payment
                  </button>
                </td>
              </tr>
            ))}
            {parties.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink/40">
                  No parties yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">Recent payments</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-brand-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase text-ink/50">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody>
              {recentPayments.map((pay) => (
                <tr key={pay.id} className="border-t border-brand-50">
                  <td className="px-4 py-3 text-ink/70">{new Date(pay.date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium text-ink">{pay.partyName}</td>
                  <td className="px-4 py-3">
                    <span className={pay.direction === 'RECEIVED' ? 'text-green-700' : 'text-red-600'}>
                      {pay.direction === 'RECEIVED' ? 'Received' : 'Paid'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink/70">₹{formatMoney(Number(pay.amount))}</td>
                  <td className="px-4 py-3 text-ink/70">{pay.method ?? '—'}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {pay.reference || pay.purchaseNumber || pay.saleInvoiceNumber || '—'}
                  </td>
                </tr>
              ))}
              {recentPayments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink/40">
                    No payments recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title="Record payment">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Party">
            <Select value={partyId} onChange={(e) => handlePartyChange(e.target.value)} required>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Direction">
              <Select value={direction} onChange={(e) => setDirection(e.target.value as 'PAID' | 'RECEIVED')} required>
                <option value="RECEIVED">Received (from them)</option>
                <option value="PAID">Paid (to them)</option>
              </Select>
            </Field>
            <Field label="Amount">
              <TextInput
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Method">
              <TextInput placeholder="Cash, UPI, Bank transfer…" value={method} onChange={(e) => setMethod(e.target.value)} />
            </Field>
          </div>
          <Field label="Reference">
            <TextInput placeholder="Cheque no., UTR, etc." value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Notes">
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Record payment'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

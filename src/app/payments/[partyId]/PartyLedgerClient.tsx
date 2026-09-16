'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select, TextArea, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { recordPayment } from '@/lib/actions/payments';

export type LedgerEntry = { date: string; type: string; label: string; impact: number; balance: number };
type PartyType = 'PURCHASE' | 'SALES' | 'BOTH' | 'TRANSPORTER' | 'DYEING' | 'AGENT' | 'JOB_WORKER';
type Party = { id: string; name: string; type: PartyType };

// Parties we typically owe money to — payment direction defaults to PAID
// for these, RECEIVED for SALES/BOTH (mirrors PaymentsClient.tsx).
const PAYABLE_PARTY_TYPES: PartyType[] = ['PURCHASE', 'TRANSPORTER', 'DYEING', 'AGENT', 'JOB_WORKER'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function PartyLedgerClient({
  party,
  openingBalance,
  entries,
  currentBalance,
}: {
  party: Party;
  openingBalance: number;
  entries: LedgerEntry[];
  currentBalance: number;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'PAID' | 'RECEIVED'>(PAYABLE_PARTY_TYPES.includes(party.type) ? 'PAID' : 'RECEIVED');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  function openModal() {
    setDirection(PAYABLE_PARTY_TYPES.includes(party.type) ? 'PAID' : 'RECEIVED');
    setAmount('');
    setDate(todayStr());
    setMethod('');
    setReference('');
    setNotes('');
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await recordPayment({ partyId: party.id, direction, amount, date, method, reference, notes });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Payment recorded');
    setOpen(false);
  }

  return (
    <div>
      <Link href="/payments" className="flex items-center gap-1.5 text-sm text-ink/60 hover:text-ink">
        <ArrowLeft size={16} /> Back to payments
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{party.name}</h1>
          <p className="mt-1 text-sm text-ink/60">{party.type} party — opening balance ₹{formatMoney(openingBalance)}</p>
        </div>
        <PrimaryButton onClick={openModal}>Record Payment</PrimaryButton>
      </div>

      <div className="mt-4 rounded-2xl border border-brand-100 bg-white p-4">
        <p className="text-xs uppercase text-ink/40">Current balance</p>
        {currentBalance === 0 ? (
          <p className="mt-1 text-xl font-semibold text-ink/50">Settled</p>
        ) : currentBalance > 0 ? (
          <p className="mt-1 text-xl font-semibold text-green-700">₹{formatMoney(currentBalance)} owed to you</p>
        ) : (
          <p className="mt-1 text-xl font-semibold text-red-600">₹{formatMoney(-currentBalance)} you owe</p>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Reference</th>
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
                <td className={`px-4 py-3 text-right font-medium ${e.impact >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {e.impact >= 0 ? '+' : '−'}₹{formatMoney(Math.abs(e.impact))}
                </td>
                <td className="px-4 py-3 text-right text-ink/70">₹{formatMoney(e.balance)}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink/40">
                  No transactions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`Record payment — ${party.name}`}>
        <form onSubmit={handleSubmit} className="space-y-3">
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

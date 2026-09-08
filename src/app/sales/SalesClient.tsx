'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Trash2, FileText, Download } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, TextArea, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { createSalesReturn } from '@/lib/actions/sales';

type Firm = { id: string; name: string };

type SaleItem = { id: string; sareeTypeName: string; quantity: number; remaining: number };

type Sale = {
  id: string;
  saleNumber: string;
  invoiceNumber: string;
  firmName: string;
  partyId: string;
  partyName: string;
  isOpeningEntry: boolean;
  date: string;
  gstAmount: string;
  totalAmount: string;
  returnedAmount: string;
  items: SaleItem[];
};

type Location = { id: string; name: string };

type ReturnLine = { saleItemId: string; quantity: string; condition: 'GOOD' | 'DAMAGED' };

export function SalesClient({
  sales,
  homeLocations,
  firms,
}: {
  sales: Sale[];
  homeLocations: Location[];
  firms: Firm[];
}) {
  const [returning, setReturning] = useState<Sale | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [locationId, setLocationId] = useState('');
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [saving, setSaving] = useState(false);

  const returnableItems = returning?.items.filter((it) => it.remaining > 0) ?? [];

  function openReturn(s: Sale) {
    setReturning(s);
    setAmount('');
    setReason('');
    setLocationId(homeLocations[0]?.id ?? '');
    const firstReturnable = s.items.find((it) => it.remaining > 0);
    setLines(firstReturnable ? [{ saleItemId: firstReturnable.id, quantity: '', condition: 'GOOD' }] : []);
  }

  function updateLine(index: number, patch: Partial<ReturnLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    const first = returnableItems[0];
    if (!first) return;
    setLines((prev) => [...prev, { saleItemId: first.id, quantity: '', condition: 'GOOD' }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!returning) return;
    setSaving(true);
    const result = await createSalesReturn({
      saleId: returning.id,
      partyId: returning.partyId,
      amount,
      reason,
      locationId,
      items: lines,
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Return recorded');
    setReturning(null);
  }

  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportFirmId, setExportFirmId] = useState('');

  function exportHref() {
    const params = new URLSearchParams();
    if (exportFrom) params.set('from', exportFrom);
    if (exportTo) params.set('to', exportTo);
    if (exportFirmId) params.set('firmId', exportFirmId);
    const qs = params.toString();
    return `/sales/export${qs ? `?${qs}` : ''}`;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-brand-100 bg-white p-4">
        <Field label="From">
          <TextInput type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <TextInput type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
        </Field>
        <Field label="Firm">
          <Select value={exportFirmId} onChange={(e) => setExportFirmId(e.target.value)}>
            <option value="">All firms</option>
            {firms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <a
          href={exportHref()}
          className="flex items-center gap-1.5 rounded-lg border border-brand-100 px-4 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
        >
          <Download size={16} /> Export CSV
        </a>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Sale #</th>
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Firm</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">GST</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Returned</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">
                  {s.saleNumber}
                  {s.isOpeningEntry && (
                    <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink/50">
                      Opening
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink/70">{s.invoiceNumber}</td>
                <td className="px-4 py-3 text-ink/70">{new Date(s.date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-ink/70">{s.firmName}</td>
                <td className="px-4 py-3 text-ink/70">{s.partyName}</td>
                <td className="px-4 py-3 text-ink/70">₹{s.gstAmount}</td>
                <td className="px-4 py-3 text-ink/70">₹{s.totalAmount}</td>
                <td className="px-4 py-3 text-ink/70">
                  {Number(s.returnedAmount) > 0 ? `₹${s.returnedAmount}` : '—'}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link
                    href={`/sales/${s.id}/print`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                  >
                    <FileText size={14} /> View Bill
                  </Link>
                  {s.items.some((it) => it.remaining > 0) && (
                    <button onClick={() => openReturn(s)} className="ml-3 text-ink/50 hover:underline">
                      Return
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-ink/40">
                  No sales yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!returning} onClose={() => setReturning(null)} title={`Return against ${returning?.saleNumber ?? ''}`}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Return amount">
            <TextInput
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Reason">
            <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Location (restock Good items here, log Damaged items here)">
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
              {homeLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-ink/80">Saree types returned</label>
              <button type="button" onClick={addLine} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                <Plus size={14} /> Add line
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {lines.map((line, i) => {
                const item = returning?.items.find((it) => it.id === line.saleItemId);
                return (
                  <div key={i} className="grid grid-cols-12 items-center gap-2">
                    <div className="col-span-5">
                      <Select
                        required
                        value={line.saleItemId}
                        onChange={(e) => updateLine(i, { saleItemId: e.target.value })}
                      >
                        {returnableItems.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.sareeTypeName} ({it.remaining} left)
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <TextInput
                        type="number"
                        min={1}
                        max={item?.remaining ?? undefined}
                        placeholder="Qty"
                        required
                        value={line.quantity}
                        onChange={(e) => updateLine(i, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="col-span-3">
                      <Select
                        value={line.condition}
                        onChange={(e) => updateLine(i, { condition: e.target.value as 'GOOD' | 'DAMAGED' })}
                      >
                        <option value="GOOD">Good</option>
                        <option value="DAMAGED">Damaged</option>
                      </Select>
                    </div>
                    <div className="col-span-1 text-right">
                      {lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(i)} className="text-ink/40 hover:text-red-600">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {returnableItems.length === 0 && (
                <p className="text-xs text-ink/40">Nothing left to return on this sale.</p>
              )}
            </div>
            <p className="mt-2 text-xs text-ink/50">
              Good sarees go back to Home stock. Damaged sarees are logged into the Damage register instead.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setReturning(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving || returnableItems.length === 0}>
              {saving ? 'Saving…' : 'Record return'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

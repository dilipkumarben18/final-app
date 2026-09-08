'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Trash2, FileText, Download } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, TextArea, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { createPurchaseReturn } from '@/lib/actions/purchases';

type Firm = { id: string; name: string };

type PurchaseItem = { rawMaterialId: string; rawMaterialName: string };

type Purchase = {
  id: string;
  purchaseNumber: string;
  purchaseType: 'WITH_INVOICE' | 'WITHOUT_INVOICE';
  invoiceNumber: string | null;
  firmName: string;
  partyId: string;
  partyName: string;
  date: string;
  gstAmount: string;
  totalAmount: string;
  returnedAmount: string;
  items: PurchaseItem[];
};

type ReturnLine = { rawMaterialId: string; quantity: string };

export function PurchasesClient({ purchases, firms }: { purchases: Purchase[]; firms: Firm[] }) {
  const [returning, setReturning] = useState<Purchase | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [saving, setSaving] = useState(false);

  // Bulk export — a plain GET link with query params. The route handler
  // sets Content-Disposition: attachment, so the browser downloads the
  // CSV directly; no client-side fetch/blob handling needed.
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportFirmId, setExportFirmId] = useState('');

  function exportHref() {
    const params = new URLSearchParams();
    if (exportFrom) params.set('from', exportFrom);
    if (exportTo) params.set('to', exportTo);
    if (exportFirmId) params.set('firmId', exportFirmId);
    const qs = params.toString();
    return `/purchases/export${qs ? `?${qs}` : ''}`;
  }

  function openReturn(p: Purchase) {
    setReturning(p);
    setAmount('');
    setReason('');
    setLines([{ rawMaterialId: p.items[0]?.rawMaterialId ?? '', quantity: '' }]);
  }

  function updateLine(index: number, patch: Partial<ReturnLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    if (!returning) return;
    setLines((prev) => [...prev, { rawMaterialId: returning.items[0]?.rawMaterialId ?? '', quantity: '' }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!returning) return;
    setSaving(true);
    const result = await createPurchaseReturn({
      purchaseId: returning.id,
      partyId: returning.partyId,
      amount,
      reason,
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
              <th className="px-4 py-3">Purchase #</th>
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Firm</th>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">GST</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Returned</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">{p.purchaseNumber}</td>
                <td className="px-4 py-3 text-ink/70">
                  {p.invoiceNumber || <span className="text-ink/30">Without invoice</span>}
                </td>
                <td className="px-4 py-3 text-ink/70">{new Date(p.date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-ink/70">{p.firmName}</td>
                <td className="px-4 py-3 text-ink/70">{p.partyName}</td>
                <td className="px-4 py-3 text-ink/70">₹{p.gstAmount}</td>
                <td className="px-4 py-3 text-ink/70">₹{p.totalAmount}</td>
                <td className="px-4 py-3 text-ink/70">
                  {Number(p.returnedAmount) > 0 ? `₹${p.returnedAmount}` : '—'}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link
                    href={`/purchases/${p.id}/print`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                  >
                    <FileText size={14} /> View Bill
                  </Link>
                  <button onClick={() => openReturn(p)} className="ml-3 text-ink/50 hover:underline">
                    Return
                  </button>
                </td>
              </tr>
            ))}
            {purchases.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-ink/40">
                  No purchases yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!returning} onClose={() => setReturning(null)} title={`Return against ${returning?.purchaseNumber ?? ''}`}>
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

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-ink/80">Materials returned</label>
              <button type="button" onClick={addLine} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                <Plus size={14} /> Add line
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-2">
                  <div className="col-span-7">
                    <Select
                      required
                      value={line.rawMaterialId}
                      onChange={(e) => updateLine(i, { rawMaterialId: e.target.value })}
                    >
                      {returning?.items.map((it) => (
                        <option key={it.rawMaterialId} value={it.rawMaterialId}>
                          {it.rawMaterialName}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <TextInput
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="Qty"
                      required
                      value={line.quantity}
                      onChange={(e) => updateLine(i, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="col-span-1 text-right">
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} className="text-ink/40 hover:text-red-600">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setReturning(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Record return'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { Upload, Download } from 'lucide-react';
import { Field, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { bulkImportSales, BulkImportSaleResult } from '@/lib/actions/sales';

type Firm = { id: string; name: string };

type Bill = {
  billNumber: string;
  invoiceNumber: string;
  date: string;
  party: { name: string; gstNumber: string; address: string; mobile: string };
  items: { sareeTypeName: string; quantity: number; rate: number }[];
  totalAmount: number;
  gstAmount: number;
  selected: boolean;
};

function pick(record: Record<string, string>, keys: string[]): string {
  for (const key of Object.keys(record)) {
    if (keys.includes(key.trim().toLowerCase())) {
      const v = record[key];
      if (v) return v.trim();
    }
  }
  return '';
}

const TEMPLATE_CSV =
  'billNumber,invoiceNumber,date,partyName,partyGstin,partyAddress,partyMobile,sareeTypeName,quantity,rate,amount,billTotal,billGstAmount\n' +
  '1,INV-001,2026-08-24,Example Customer,29ABCDE1234F1Z5,"Bengaluru",9876543210,Bodi,10,1200,12000,12600,600\n';

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sales-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkImportSalesClient({ firms }: { firms: Firm[] }) {
  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [firmId, setFirmId] = useState('');
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<BulkImportSaleResult[] | null>(null);

  function handleFile(file: File) {
    setResults(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const grouped = new Map<string, Bill>();
        for (const r of parsed.data) {
          const billNumber = pick(r, ['billnumber', 'bill number', 'bill no', 'bill no.', 'saleno', 'sale no']);
          const invoiceNumber = pick(r, ['invoicenumber', 'invoice number', 'invoice no', 'invoice no.']);
          if (!billNumber || !invoiceNumber) continue;

          if (!grouped.has(billNumber)) {
            grouped.set(billNumber, {
              billNumber,
              invoiceNumber,
              date: pick(r, ['date']),
              party: {
                name: pick(r, ['partyname', 'party name', 'name']),
                gstNumber: pick(r, ['partygstin', 'gstin', 'gst number', 'gstnumber']),
                address: pick(r, ['partyaddress', 'address']),
                mobile: pick(r, ['partymobile', 'mobile', 'contact']),
              },
              items: [],
              totalAmount: Number(pick(r, ['billtotal', 'bill total', 'total', 'totalamount'])) || 0,
              gstAmount: Number(pick(r, ['billgstamount', 'gst amount', 'gstamount'])) || 0,
              selected: true,
            });
          }
          const bill = grouped.get(billNumber)!;
          const sareeTypeName = pick(r, ['sareetypename', 'saree type', 'sareetype', 'item', 'itemname']);
          if (sareeTypeName) {
            bill.items.push({
              sareeTypeName,
              quantity: Number(pick(r, ['quantity', 'qty'])) || 0,
              rate: Number(pick(r, ['rate', 'price/unit'])) || 0,
            });
          }
        }

        const billList = Array.from(grouped.values()).filter((b) => b.items.length > 0 && b.party.name);
        if (billList.length === 0) {
          toast.error('No valid rows found — check the column names against the template.');
          return;
        }
        setBills(billList);
      },
      error: (err) => toast.error(`Could not read file: ${err.message}`),
    });
  }

  function toggleBill(billNumber: string) {
    setBills((prev) => prev.map((b) => (b.billNumber === billNumber ? { ...b, selected: !b.selected } : b)));
  }

  async function handleImport() {
    if (!firmId) {
      toast.error('Select which firm these bills belong to.');
      return;
    }
    const selected = bills.filter((b) => b.selected);
    if (selected.length === 0) {
      toast.error('Select at least one bill to import.');
      return;
    }
    setImporting(true);
    const { results: importResults, error } = await bulkImportSales({
      firmId,
      bills: selected.map((b) => ({
        billNumber: b.billNumber,
        invoiceNumber: b.invoiceNumber,
        date: b.date,
        gstAmount: b.gstAmount,
        totalAmount: b.totalAmount,
        party: {
          name: b.party.name,
          gstNumber: b.party.gstNumber || undefined,
          address: b.party.address || undefined,
          mobile: b.party.mobile || undefined,
        },
        items: b.items,
      })),
    });
    setImporting(false);

    if (error) {
      toast.error(error);
      return;
    }
    setResults(importResults);
    const created = importResults.filter((r) => r.status === 'created').length;
    toast.success(`Imported ${created} of ${selected.length} selected bills`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-100 bg-white p-4">
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700">
          <Upload size={16} /> Choose CSV file
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </label>
        <SecondaryButton type="button" onClick={downloadTemplate} className="flex items-center gap-1.5">
          <Download size={16} /> Download template
        </SecondaryButton>
        <p className="text-xs text-ink/50">
          One row per line item, grouped by billNumber. Saree types not already in your master
          are created automatically.
        </p>
      </div>

      {bills.length > 0 && (
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Field label="Firm these bills belong to">
              <Select value={firmId} onChange={(e) => setFirmId(e.target.value)}>
                <option value="">Select firm…</option>
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
            <PrimaryButton onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : `Import ${bills.filter((b) => b.selected).length} bills`}
            </PrimaryButton>
          </div>

          <div className="mt-4 max-h-[480px] overflow-auto rounded-xl border border-brand-50">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-brand-50 text-xs uppercase text-ink/50">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Bill #</th>
                  <th className="px-3 py-2">Invoice #</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Party</th>
                  <th className="px-3 py-2">Items</th>
                  <th className="px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.billNumber} className="border-t border-brand-50">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={b.selected} onChange={() => toggleBill(b.billNumber)} />
                    </td>
                    <td className="px-3 py-2 font-medium text-ink">{b.billNumber}</td>
                    <td className="px-3 py-2 text-ink/70">{b.invoiceNumber}</td>
                    <td className="px-3 py-2 text-ink/70">{b.date}</td>
                    <td className="px-3 py-2 text-ink/70">{b.party.name}</td>
                    <td className="px-3 py-2 text-ink/70">{b.items.map((it) => it.sareeTypeName).join(', ')}</td>
                    <td className="px-3 py-2 text-ink/70">₹{b.totalAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results && (
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <h2 className="font-display text-base font-semibold text-ink">Import results</h2>
          <div className="mt-3 max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-50 text-xs uppercase text-ink/50">
                <tr>
                  <th className="px-3 py-2">Bill #</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-t border-brand-50">
                    <td className="px-3 py-2 text-ink">{r.billNumber}</td>
                    <td className="px-3 py-2">
                      {r.status === 'created' && <span className="text-green-700">Created</span>}
                      {r.status === 'skipped' && <span className="text-amber-600">Skipped — {r.reason}</span>}
                      {r.status === 'error' && <span className="text-red-600">Failed — {r.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

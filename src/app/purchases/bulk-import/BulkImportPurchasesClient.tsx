'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { Upload, Download, AlertTriangle, ArrowRight } from 'lucide-react';
import { Field, TextInput, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { bulkImportPurchases, BulkImportBillResult } from '@/lib/actions/purchases';

type Firm = { id: string; name: string };
type RawMaterialOption = { id: string; name: string; category: string; unit: string };
type SareeTypeOption = { id: string; name: string };

type RawItemRow = {
  billNumber: string;
  invoiceNumber: string;
  date: string;
  docType: string;
  partyName: string;
  partyGstin: string;
  partyAddress: string;
  partyMobile: string;
  itemName: string;
  hsn: string;
  quantity: string;
  unit: string;
  rate: string;
  gstRate: string;
  amount: string;
  billTotal: string;
  billGstAmount: string;
};

type Bill = {
  billNumber: string;
  invoiceNumber: string;
  date: string;
  party: { name: string; gstNumber: string; address: string; mobile: string };
  items: { name: string; hsn: string; quantity: number; unit: string; rate: number }[];
  totalAmount: number;
  gstAmount: number;
  selected: boolean;
};

type ItemKind = 'RAW_MATERIAL' | 'SAREE_TYPE' | 'DYE' | 'ELECTRONICS';
type RawMaterialCategory = 'WARP' | 'WEFT' | 'JARI' | 'DYE' | 'ELECTRONICS' | 'OTHER';

type Classification = {
  kind: ItemKind;
  category: RawMaterialCategory;
  unit: string;
  existingId: string; // '' means create new
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
  'billNumber,invoiceNumber,date,docType,partyName,partyGstin,partyAddress,partyMobile,itemName,hsn,quantity,unit,rate,gstRate,amount,billTotal,billGstAmount\n' +
  '1374,1374,2026-08-24,BILL,Omkar silks,29ADTPN8104E1Z8,"Bengaluru",,silk yarn,500400,24.65,Kg,6650,5,172118.625,172119,8196.125\n';

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'purchase-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkImportPurchasesClient({
  firms,
  rawMaterials,
  sareeTypes,
}: {
  firms: Firm[];
  rawMaterials: RawMaterialOption[];
  sareeTypes: SareeTypeOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<'upload' | 'classify' | 'preview' | 'done'>('upload');
  const [bills, setBills] = useState<Bill[]>([]);
  const [flagged, setFlagged] = useState<{ billNumber: string; docType: string }[]>([]);
  const [classifications, setClassifications] = useState<Record<string, Classification>>({});
  const [firmId, setFirmId] = useState('');
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<BulkImportBillResult[] | null>(null);

  function handleFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const rows: RawItemRow[] = parsed.data.map((r) => ({
          billNumber: pick(r, ['billnumber', 'bill number', 'bill no', 'bill no.']),
          invoiceNumber: pick(r, ['invoicenumber', 'invoice number', 'invoice no', 'invoice no.']),
          date: pick(r, ['date']),
          docType: pick(r, ['doctype', 'doc type']) || 'BILL',
          partyName: pick(r, ['partyname', 'party name', 'name']),
          partyGstin: pick(r, ['partygstin', 'gstin', 'gst number', 'gstnumber']),
          partyAddress: pick(r, ['partyaddress', 'address']),
          partyMobile: pick(r, ['partymobile', 'mobile', 'contact']),
          itemName: pick(r, ['itemname', 'item name', 'item']),
          hsn: pick(r, ['hsn', 'hsn/sac']),
          quantity: pick(r, ['quantity', 'qty']),
          unit: pick(r, ['unit']),
          rate: pick(r, ['rate', 'price/unit', 'price per unit']),
          gstRate: pick(r, ['gstrate', 'gst rate']),
          amount: pick(r, ['amount']),
          billTotal: pick(r, ['billtotal', 'bill total', 'total', 'totalamount']),
          billGstAmount: pick(r, ['billgstamount', 'gst amount', 'gstamount']),
        }));

        const billRows = rows.filter((r) => r.docType.toUpperCase() === 'BILL' && r.billNumber);
        const otherRows = rows.filter((r) => r.docType.toUpperCase() !== 'BILL' && r.billNumber);

        const grouped = new Map<string, Bill>();
        for (const r of billRows) {
          if (!grouped.has(r.billNumber)) {
            grouped.set(r.billNumber, {
              billNumber: r.billNumber,
              invoiceNumber: r.invoiceNumber,
              date: r.date,
              party: { name: r.partyName, gstNumber: r.partyGstin, address: r.partyAddress, mobile: r.partyMobile },
              items: [],
              totalAmount: Number(r.billTotal) || 0,
              gstAmount: Number(r.billGstAmount) || 0,
              selected: true,
            });
          }
          const bill = grouped.get(r.billNumber)!;
          if (r.itemName) {
            bill.items.push({
              name: r.itemName,
              hsn: r.hsn,
              quantity: Number(r.quantity) || 0,
              unit: r.unit,
              rate: Number(r.rate) || 0,
            });
          }
        }

        const billList = Array.from(grouped.values()).filter((b) => b.items.length > 0 && b.party.name);
        if (billList.length === 0) {
          toast.error('No valid BILL rows found — check the column names against the template.');
          return;
        }

        // Seed classification defaults from any exact-name match already in
        // the Raw Material / Saree Type masters; otherwise default to
        // Raw Material / Other, left for the user to correct below.
        const uniqueNames = new Set<string>();
        billList.forEach((b) => b.items.forEach((it) => uniqueNames.add(it.name.trim())));

        const initialClassifications: Record<string, Classification> = {};
        uniqueNames.forEach((name) => {
          const matchMaterial = rawMaterials.find((m) => m.name.toLowerCase() === name.toLowerCase());
          const matchSaree = sareeTypes.find((s) => s.name.toLowerCase() === name.toLowerCase());
          if (matchMaterial) {
            const cat = matchMaterial.category as RawMaterialCategory;
            initialClassifications[name] = {
              kind: cat === 'DYE' || cat === 'ELECTRONICS' ? cat : 'RAW_MATERIAL',
              category: cat,
              unit: matchMaterial.unit,
              existingId: matchMaterial.id,
            };
          } else if (matchSaree) {
            initialClassifications[name] = { kind: 'SAREE_TYPE', category: 'OTHER', unit: '', existingId: matchSaree.id };
          } else {
            const sampleUnit = billList.flatMap((b) => b.items).find((it) => it.name.trim() === name)?.unit || 'Nos';
            initialClassifications[name] = { kind: 'RAW_MATERIAL', category: 'OTHER', unit: sampleUnit, existingId: '' };
          }
        });

        setBills(billList);
        setFlagged(otherRows.map((r) => ({ billNumber: r.billNumber, docType: r.docType })));
        setClassifications(initialClassifications);
        setStep('classify');
      },
      error: (err) => toast.error(`Could not read file: ${err.message}`),
    });
  }

  const uniqueItemNames = useMemo(() => Object.keys(classifications).sort(), [classifications]);

  function updateClassification(name: string, patch: Partial<Classification>) {
    setClassifications((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
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
    const { results: importResults, error } = await bulkImportPurchases({
      firmId,
      bills: selected.map((b) => ({
        billNumber: b.billNumber,
        invoiceNumber: b.invoiceNumber || undefined,
        date: b.date,
        gstAmount: b.gstAmount,
        totalAmount: b.totalAmount,
        party: {
          name: b.party.name,
          gstNumber: b.party.gstNumber || undefined,
          address: b.party.address || undefined,
          mobile: b.party.mobile || undefined,
        },
        items: b.items.map((it) => {
          const c = classifications[it.name.trim()];
          const uiKind = c?.kind ?? 'RAW_MATERIAL';
          const serverKind = uiKind === 'SAREE_TYPE' ? 'SAREE_TYPE' : 'RAW_MATERIAL';
          const category =
            serverKind === 'RAW_MATERIAL' ? (uiKind === 'DYE' ? 'DYE' : uiKind === 'ELECTRONICS' ? 'ELECTRONICS' : c?.category) : undefined;
          return {
            name: it.name,
            hsn: it.hsn || undefined,
            quantity: it.quantity,
            unit: it.unit || c?.unit || undefined,
            rate: it.rate,
            kind: serverKind,
            category,
            existingId: c?.existingId || undefined,
          };
        }),
      })),
    });
    setImporting(false);

    if (error) {
      toast.error(error);
      return;
    }
    setResults(importResults);
    setStep('done');
    const created = importResults.filter((r) => r.status === 'created').length;
    toast.success(`Imported ${created} of ${selected.length} selected bills`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {step === 'upload' && (
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
            One row per line item, grouped by billNumber. Rows with docType Debit Note / Payment Out
            are flagged for manual entry rather than auto-imported.
          </p>
        </div>
      )}

      {step === 'classify' && (
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-ink">
                Classify {uniqueItemNames.length} item{uniqueItemNames.length === 1 ? '' : 's'}
              </h2>
              <p className="text-xs text-ink/50">
                Pick what each purchased item actually is. New Raw Materials/Saree Types are created
                automatically; picking an existing one links to it instead. Electronics items never
                affect stock quantity, in this import or in regular Purchase Entry — they're recorded
                for the party ledger and GST only.
              </p>
            </div>
            <PrimaryButton onClick={() => setStep('preview')} className="flex items-center gap-1.5">
              Continue <ArrowRight size={16} />
            </PrimaryButton>
          </div>

          {flagged.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {flagged.length} row(s) ({[...new Set(flagged.map((f) => f.docType))].join(', ')}) were found
                and are not auto-imported — enter these manually via Purchase Return / Payments after
                import: {flagged.map((f) => f.billNumber).join(', ')}
              </span>
            </div>
          )}

          <div className="mt-3 max-h-[480px] overflow-auto rounded-xl border border-brand-50">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-brand-50 text-xs uppercase text-ink/50">
                <tr>
                  <th className="px-3 py-2">Item name</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Map to existing</th>
                  <th className="px-3 py-2">Unit</th>
                </tr>
              </thead>
              <tbody>
                {uniqueItemNames.map((name) => {
                  const c = classifications[name];
                  return (
                    <tr key={name} className="border-t border-brand-50">
                      <td className="px-3 py-2 font-medium text-ink">{name}</td>
                      <td className="px-3 py-2">
                        <Select
                          value={c.kind}
                          onChange={(e) => {
                            const kind = e.target.value as ItemKind;
                            const category: RawMaterialCategory =
                              kind === 'DYE' ? 'DYE' : kind === 'ELECTRONICS' ? 'ELECTRONICS' : c.category;
                            updateClassification(name, { kind, category, existingId: '' });
                          }}
                        >
                          <option value="RAW_MATERIAL">Raw Material</option>
                          <option value="DYE">Dye</option>
                          <option value="ELECTRONICS">Electronics (no stock)</option>
                          <option value="SAREE_TYPE">Finished Saree</option>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        {c.kind === 'RAW_MATERIAL' ? (
                          <Select
                            value={c.category}
                            onChange={(e) => updateClassification(name, { category: e.target.value as RawMaterialCategory })}
                          >
                            <option value="WARP">Warp</option>
                            <option value="WEFT">Weft</option>
                            <option value="JARI">Jari</option>
                            <option value="OTHER">Other</option>
                          </Select>
                        ) : (
                          <span className="text-ink/30">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={c.existingId}
                          onChange={(e) => updateClassification(name, { existingId: e.target.value })}
                        >
                          <option value="">+ Create new</option>
                          {(c.kind === 'SAREE_TYPE' ? sareeTypes : rawMaterials).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        {c.kind !== 'SAREE_TYPE' && !c.existingId ? (
                          <TextInput
                            value={c.unit}
                            onChange={(e) => updateClassification(name, { unit: e.target.value })}
                            placeholder="Nos, Kg..."
                          />
                        ) : (
                          <span className="text-ink/30">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'preview' && (
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
            <div className="flex gap-2">
              <SecondaryButton onClick={() => setStep('classify')}>Back</SecondaryButton>
              <PrimaryButton onClick={handleImport} disabled={importing}>
                {importing ? 'Importing…' : `Import ${bills.filter((b) => b.selected).length} bills`}
              </PrimaryButton>
            </div>
          </div>

          <div className="mt-4 max-h-[480px] overflow-auto rounded-xl border border-brand-50">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-brand-50 text-xs uppercase text-ink/50">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Bill #</th>
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
                    <td className="px-3 py-2 text-ink/70">{b.date}</td>
                    <td className="px-3 py-2 text-ink/70">{b.party.name}</td>
                    <td className="px-3 py-2 text-ink/70">{b.items.map((it) => it.name).join(', ')}</td>
                    <td className="px-3 py-2 text-ink/70">₹{b.totalAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'done' && results && (
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
          <SecondaryButton className="mt-4" onClick={() => setStep('upload')}>
            Import another file
          </SecondaryButton>
        </div>
      )}
    </div>
  );
}

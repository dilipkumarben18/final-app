'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { Upload, Download, AlertTriangle } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { bulkImportParties, BulkImportRowResult } from '@/lib/actions/parties';

type PartyType = 'PURCHASE' | 'SALES' | 'BOTH' | 'TRANSPORTER' | 'DYEING' | 'AGENT' | 'JOB_WORKER';
const PARTY_TYPES: PartyType[] = ['PURCHASE', 'SALES', 'BOTH', 'TRANSPORTER', 'DYEING', 'AGENT', 'JOB_WORKER'];

type ParsedRow = {
  rowNumber: number;
  name: string;
  type: PartyType;
  gstNumber: string;
  address: string;
  mobile: string;
  email: string;
  selected: boolean;
  statusKind: 'new' | 'duplicate' | 'invalid';
  statusReason?: string;
};

type ExistingParty = { name: string; gstNumber: string | null };

// Accepts a handful of common header spellings so a CSV exported from
// somewhere else (or the preview CSV this feature's own template produces)
// doesn't have to match one exact casing/wording.
function pick(record: Record<string, string>, keys: string[]): string {
  for (const key of Object.keys(record)) {
    if (keys.includes(key.trim().toLowerCase())) {
      const v = record[key];
      if (v) return v.trim();
    }
  }
  return '';
}

function normalizeType(raw: string): PartyType {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, '_');
  return (PARTY_TYPES as string[]).includes(upper) ? (upper as PartyType) : 'PURCHASE';
}

const TEMPLATE_CSV =
  'name,type,gstNumber,state,address,mobile\n' +
  'Example Silk Traders,PURCHASE,29ABCDE1234F1Z5,29-Karnataka,"123 Market Road, Bengaluru",9876543210\n';

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'party-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkImportPartiesClient({ existing }: { existing: ExistingParty[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<BulkImportRowResult[] | null>(null);

  function handleFile(file: File) {
    setResults(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const existingNames = new Set(existing.map((p) => p.name.trim().toLowerCase()));
        const existingGsts = new Set(existing.filter((p) => p.gstNumber).map((p) => p.gstNumber as string));
        const seenInFile = new Set<string>(); // dedupe within the uploaded file itself

        const parsedRows: ParsedRow[] = parsed.data.map((record, i) => {
          const name = pick(record, ['name', 'party name', 'partyname']);
          const gstNumber = pick(record, ['gstnumber', 'gstin', 'gst no', 'gst number']);
          const state = pick(record, ['state']);
          const addressRaw = pick(record, ['address']);
          const address = state ? [addressRaw, state].filter(Boolean).join(', ') : addressRaw;
          const mobile = pick(record, ['mobile', 'contact', 'phone', 'contact no', 'contact no.']);
          const email = pick(record, ['email']);
          const type = normalizeType(pick(record, ['type']));

          let statusKind: ParsedRow['statusKind'] = 'new';
          let statusReason: string | undefined;

          if (!name) {
            statusKind = 'invalid';
            statusReason = 'Missing name';
          } else {
            const dedupeKey = gstNumber || name.trim().toLowerCase();
            if (gstNumber && existingGsts.has(gstNumber)) {
              statusKind = 'duplicate';
              statusReason = 'GSTIN already exists';
            } else if (!gstNumber && existingNames.has(name.trim().toLowerCase())) {
              statusKind = 'duplicate';
              statusReason = 'Name already exists';
            } else if (seenInFile.has(dedupeKey)) {
              statusKind = 'duplicate';
              statusReason = 'Repeated within this file';
            }
            seenInFile.add(dedupeKey);
          }

          return {
            rowNumber: i + 1,
            name,
            type,
            gstNumber,
            address,
            mobile,
            email,
            selected: statusKind === 'new',
            statusKind,
            statusReason,
          };
        });

        setRows(parsedRows);
      },
      error: (err) => {
        toast.error(`Could not read file: ${err.message}`);
      },
    });
  }

  function toggleRow(rowNumber: number) {
    setRows((prev) => prev.map((r) => (r.rowNumber === rowNumber ? { ...r, selected: !r.selected } : r)));
  }

  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((r) => (r.statusKind === 'invalid' ? r : { ...r, selected: checked })));
  }

  async function handleImport() {
    const selected = rows.filter((r) => r.selected);
    if (selected.length === 0) {
      toast.error('Select at least one row to import.');
      return;
    }
    setImporting(true);
    const { results: importResults, error } = await bulkImportParties(
      selected.map((r) => ({
        name: r.name,
        type: r.type,
        gstNumber: r.gstNumber || undefined,
        address: r.address || undefined,
        mobile: r.mobile || undefined,
        email: r.email || undefined,
      }))
    );
    setImporting(false);

    if (error) {
      toast.error(error);
      return;
    }
    setResults(importResults);
    const created = importResults.filter((r) => r.status === 'created').length;
    toast.success(`Imported ${created} of ${selected.length} selected rows`);
    router.refresh();
  }

  const selectedCount = rows.filter((r) => r.selected).length;
  const newCount = rows.filter((r) => r.statusKind === 'new').length;
  const duplicateCount = rows.filter((r) => r.statusKind === 'duplicate').length;
  const invalidCount = rows.filter((r) => r.statusKind === 'invalid').length;

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
          Expected columns: name, type, gstNumber, state, address, mobile — extra/missing columns are fine.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium text-ink">{rows.length} rows parsed</span>
              <span className="text-green-700">{newCount} new</span>
              {duplicateCount > 0 && <span className="text-amber-600">{duplicateCount} duplicate</span>}
              {invalidCount > 0 && <span className="text-red-600">{invalidCount} invalid</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleAll(true)} className="text-xs font-medium text-brand-700 hover:underline">
                Select all
              </button>
              <button onClick={() => toggleAll(false)} className="text-xs font-medium text-ink/50 hover:underline">
                Deselect all
              </button>
            </div>
          </div>

          <div className="mt-3 max-h-[480px] overflow-auto rounded-xl border border-brand-50">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-brand-50 text-xs uppercase text-ink/50">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">GSTIN</th>
                  <th className="px-3 py-2">Mobile</th>
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rowNumber} className="border-t border-brand-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        disabled={r.statusKind === 'invalid'}
                        onChange={() => toggleRow(r.rowNumber)}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-ink">{r.name || <span className="text-ink/30">—</span>}</td>
                    <td className="px-3 py-2 text-ink/70">{r.type}</td>
                    <td className="px-3 py-2 text-ink/70">{r.gstNumber || '—'}</td>
                    <td className="px-3 py-2 text-ink/70">{r.mobile || '—'}</td>
                    <td className="px-3 py-2 text-ink/70">{r.address || '—'}</td>
                    <td className="px-3 py-2">
                      {r.statusKind === 'new' && <span className="text-xs font-medium text-green-700">New</span>}
                      {r.statusKind === 'duplicate' && (
                        <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                          <AlertTriangle size={12} /> {r.statusReason}
                        </span>
                      )}
                      {r.statusKind === 'invalid' && (
                        <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                          <AlertTriangle size={12} /> {r.statusReason}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end">
            <PrimaryButton onClick={handleImport} disabled={importing || selectedCount === 0}>
              {importing ? 'Importing…' : `Import ${selectedCount} selected`}
            </PrimaryButton>
          </div>
        </div>
      )}

      {results && (
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <h2 className="font-display text-base font-semibold text-ink">Import results</h2>
          <div className="mt-3 max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-50 text-xs uppercase text-ink/50">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-t border-brand-50">
                    <td className="px-3 py-2 text-ink">{r.name}</td>
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

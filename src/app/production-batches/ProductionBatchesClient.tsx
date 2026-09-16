'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Check, Plus } from 'lucide-react';
import { Field, Select, TextArea, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import {
  createProductionBatch,
  addEntryToBatch,
  completeProductionBatch,
  unlockProductionBatch,
} from '@/lib/actions/productionBatches';

type WarpEntry = { id: string; sareeTypeName: string; status: string; assignmentDate: string };
type IssueEntry = { id: string; date: string; sareeCount: number; weftIssuedGrams: string; jariIssued: string };
type WageEntry = { id: string; date: string; sareeTypeName: string | null; quantity: number; rate: string; amount: string; paid: number };
type Batch = {
  id: string;
  batchNumber: number;
  status: 'IN_PRODUCTION' | 'COMPLETED';
  date: string;
  notes: string | null;
  warpAssignments: WarpEntry[];
  materialIssues: IssueEntry[];
  wages: WageEntry[];
  checklist: string[];
};
type Option = { id: string; label: string };

function formatMoney(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function ProductionBatchesClient({
  weavers,
  selectedWeaverId,
  batches,
  untaggedWarpAssignments,
  untaggedMaterialIssues,
  untaggedWages,
}: {
  weavers: { id: string; name: string }[];
  selectedWeaverId: string;
  batches: Batch[];
  untaggedWarpAssignments: Option[];
  untaggedMaterialIssues: Option[];
  untaggedWages: Option[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingCreate, setSavingCreate] = useState(false);
  const [busyBatchId, setBusyBatchId] = useState<string | null>(null);
  const [checklistFor, setChecklistFor] = useState<Batch | null>(null);

  const [pickers, setPickers] = useState<Record<string, { warp: string; issue: string; wage: string }>>({});

  function pickerFor(batchId: string) {
    return pickers[batchId] ?? { warp: '', issue: '', wage: '' };
  }
  function setPicker(batchId: string, patch: Partial<{ warp: string; issue: string; wage: string }>) {
    setPickers((prev) => ({ ...prev, [batchId]: { ...pickerFor(batchId), ...patch } }));
  }

  function handleWeaverChange(id: string) {
    router.push(`/production-batches?weaverId=${id}`);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSavingCreate(true);
    const result = await createProductionBatch({ weaverId: selectedWeaverId, notes });
    setSavingCreate(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Purai created');
    setCreating(false);
    setNotes('');
  }

  async function handleAdd(batchId: string, entryType: 'WarpAssignment' | 'MaterialIssue' | 'WeaverWage', entryId: string) {
    if (!entryId) return;
    setBusyBatchId(batchId);
    const result = await addEntryToBatch({ productionBatchId: batchId, weaverId: selectedWeaverId, entryType, entryId });
    setBusyBatchId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Added to Purai');
    setPicker(batchId, entryType === 'WarpAssignment' ? { warp: '' } : entryType === 'MaterialIssue' ? { issue: '' } : { wage: '' });
  }

  async function handleComplete(batch: Batch) {
    setBusyBatchId(batch.id);
    const result = await completeProductionBatch({ id: batch.id, weaverId: selectedWeaverId });
    setBusyBatchId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Purai marked complete');
    setChecklistFor(null);
  }

  async function handleUnlock(batch: Batch) {
    setBusyBatchId(batch.id);
    const result = await unlockProductionBatch({ id: batch.id, weaverId: selectedWeaverId });
    setBusyBatchId(null);
    if (result.error) toast.error(result.error);
    else toast.success('Purai unlocked for edit');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Weaver">
          <Select value={selectedWeaverId} onChange={(e) => handleWeaverChange(e.target.value)} style={{ minWidth: 220 }}>
            {weavers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <PrimaryButton onClick={() => setCreating(true)} className="flex items-center gap-1.5">
          <Plus size={16} /> New Purai
        </PrimaryButton>
      </div>

      {batches.length === 0 && (
        <p className="rounded-2xl border border-brand-100 bg-white p-6 text-center text-sm text-ink/40">
          No Purai batches yet for this weaver — click New Purai to start one.
        </p>
      )}

      {batches.map((batch) => {
        const picker = pickerFor(batch.id);
        const busy = busyBatchId === batch.id;
        const locked = batch.status === 'COMPLETED';
        return (
          <div key={batch.id} className="rounded-2xl border border-brand-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-semibold text-ink">Purai {batch.batchNumber}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    locked ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {locked ? 'Completed' : 'In Production'}
                </span>
              </div>
              <div className="flex gap-2">
                {locked ? (
                  <SecondaryButton onClick={() => handleUnlock(batch)} disabled={busy}>
                    Unlock for Edit
                  </SecondaryButton>
                ) : (
                  <PrimaryButton onClick={() => setChecklistFor(batch)} disabled={busy} className="flex items-center gap-1.5">
                    <Check size={14} /> Complete Purai
                  </PrimaryButton>
                )}
              </div>
            </div>
            <p className="mt-0.5 text-xs text-ink/50">{new Date(batch.date).toLocaleDateString()}</p>
            {batch.notes && <p className="mt-1 text-sm text-ink/70">{batch.notes}</p>}

            {batch.checklist.length > 0 && (
              <div className="mt-3 space-y-1">
                {batch.checklist.map((w, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-amber-700">
                    <AlertTriangle size={12} /> {w}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Warp assignments</p>
                <ul className="mt-1.5 space-y-1 text-sm text-ink/70">
                  {batch.warpAssignments.map((a) => (
                    <li key={a.id}>
                      {a.sareeTypeName} — {a.status.replace(/_/g, ' ').toLowerCase()}
                    </li>
                  ))}
                  {batch.warpAssignments.length === 0 && <li className="text-ink/30">None yet</li>}
                </ul>
                {!locked && untaggedWarpAssignments.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    <Select value={picker.warp} onChange={(e) => setPicker(batch.id, { warp: e.target.value })} className="text-xs">
                      <option value="">Add warp…</option>
                      {untaggedWarpAssignments.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                    <SecondaryButton
                      onClick={() => handleAdd(batch.id, 'WarpAssignment', picker.warp)}
                      disabled={!picker.warp || busy}
                      className="px-2.5 py-1.5 text-xs"
                    >
                      Add
                    </SecondaryButton>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Material issues</p>
                <ul className="mt-1.5 space-y-1 text-sm text-ink/70">
                  {batch.materialIssues.map((m) => (
                    <li key={m.id}>
                      {new Date(m.date).toLocaleDateString()} — Weft {m.weftIssuedGrams}g, Jari {m.jariIssued}
                    </li>
                  ))}
                  {batch.materialIssues.length === 0 && <li className="text-ink/30">None yet</li>}
                </ul>
                {!locked && untaggedMaterialIssues.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    <Select value={picker.issue} onChange={(e) => setPicker(batch.id, { issue: e.target.value })} className="text-xs">
                      <option value="">Add issue…</option>
                      {untaggedMaterialIssues.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                    <SecondaryButton
                      onClick={() => handleAdd(batch.id, 'MaterialIssue', picker.issue)}
                      disabled={!picker.issue || busy}
                      className="px-2.5 py-1.5 text-xs"
                    >
                      Add
                    </SecondaryButton>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Wages</p>
                <ul className="mt-1.5 space-y-1 text-sm text-ink/70">
                  {batch.wages.map((w) => (
                    <li key={w.id}>
                      {new Date(w.date).toLocaleDateString()} — ₹{formatMoney(Number(w.amount))}
                      {w.paid >= Number(w.amount) ? (
                        <span className="ml-1 text-green-700">(paid)</span>
                      ) : w.paid > 0 ? (
                        <span className="ml-1 text-amber-600">(partly paid)</span>
                      ) : (
                        <span className="ml-1 text-red-600">(unpaid)</span>
                      )}
                    </li>
                  ))}
                  {batch.wages.length === 0 && <li className="text-ink/30">None yet</li>}
                </ul>
                {!locked && untaggedWages.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    <Select value={picker.wage} onChange={(e) => setPicker(batch.id, { wage: e.target.value })} className="text-xs">
                      <option value="">Add wage…</option>
                      {untaggedWages.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                    <SecondaryButton
                      onClick={() => handleAdd(batch.id, 'WeaverWage', picker.wage)}
                      disabled={!picker.wage || busy}
                      className="px-2.5 py-1.5 text-xs"
                    >
                      Add
                    </SecondaryButton>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <Modal open={creating} onClose={() => setCreating(false)} title="New Purai">
        <form onSubmit={handleCreate} className="space-y-3">
          <Field label="Notes (optional)">
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setCreating(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={savingCreate}>
              {savingCreate ? 'Creating…' : 'Create Purai'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!checklistFor}
        onClose={() => setChecklistFor(null)}
        title={checklistFor ? `Complete Purai ${checklistFor.batchNumber}?` : ''}
      >
        {checklistFor && (
          <div>
            {checklistFor.checklist.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <Check size={16} /> All checks passed — ready to complete.
              </div>
            ) : (
              <div className="space-y-2">
                {checklistFor.checklist.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md bg-red-50 p-2 text-sm text-red-600">
                    <AlertTriangle size={14} /> {w}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2 border-t border-brand-100 pt-4">
              <SecondaryButton onClick={() => setChecklistFor(null)}>Go Back &amp; Fix</SecondaryButton>
              <PrimaryButton onClick={() => handleComplete(checklistFor)} disabled={busyBatchId === checklistFor.id}>
                {checklistFor.checklist.length === 0 ? 'Complete Purai' : 'Complete Anyway'}
              </PrimaryButton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

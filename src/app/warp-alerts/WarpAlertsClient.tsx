'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, TextArea, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { assignWarp, recordWarpStartDate } from '@/lib/actions/warpAssignments';

type Weaver = {
  id: string;
  name: string;
  sareeTypeIds: string[];
  current: { id: string; sareeTypeName: string; receivedCount: number } | null;
  awaitingCut: { sareeTypeName: string } | null;
  pending: { id: string; sareeTypeName: string; status: 'ASSIGNED' | 'WAITING_TO_START' } | null;
};

type SareeTypeOption = { id: string; name: string };
type AvailableWarpShade = { id: string; shadeNumber: string; quantity: number };
type AvailableWarp = { id: string; label: string; shadeLines: AvailableWarpShade[] };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function WarpAlertsClient({
  weavers,
  sareeTypes,
  availableWarps,
}: {
  weavers: Weaver[];
  sareeTypes: SareeTypeOption[];
  availableWarps: AvailableWarp[];
}) {
  const [assigning, setAssigning] = useState<Weaver | null>(null);
  const [sareeTypeId, setSareeTypeId] = useState('');
  const [dyeingBatchWarpId, setDyeingBatchWarpId] = useState('');
  const [assignmentDate, setAssignmentDate] = useState(todayStr());
  const [remarks, setRemarks] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);

  const [startingFor, setStartingFor] = useState<{ weaverName: string; assignmentId: string } | null>(null);
  const [startDate, setStartDate] = useState(todayStr());
  const [startSaving, setStartSaving] = useState(false);
  const [shadeOrder, setShadeOrder] = useState<AvailableWarpShade[]>([]);

  function openAssign(w: Weaver) {
    setAssigning(w);
    const allowed = sareeTypes.filter((s) => w.sareeTypeIds.length === 0 || w.sareeTypeIds.includes(s.id));
    setSareeTypeId(allowed[0]?.id ?? sareeTypes[0]?.id ?? '');
    const firstWarpId = availableWarps[0]?.id ?? '';
    setDyeingBatchWarpId(firstWarpId);
    setShadeOrder(availableWarps[0]?.shadeLines ?? []);
    setAssignmentDate(todayStr());
    setRemarks('');
  }

  function selectWarp(id: string) {
    setDyeingBatchWarpId(id);
    setShadeOrder(availableWarps.find((w) => w.id === id)?.shadeLines ?? []);
  }

  function moveShade(index: number, direction: -1 | 1) {
    setShadeOrder((prev) => {
      const next = prev.slice();
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assigning) return;
    setAssignSaving(true);
    const result = await assignWarp({
      weaverId: assigning.id,
      sareeTypeId,
      dyeingBatchWarpId,
      assignmentDate,
      remarks,
      shadeOrder: shadeOrder.map((s) => s.id),
    });
    setAssignSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Warp assigned');
    setAssigning(null);
  }

  function openStart(w: Weaver) {
    if (!w.pending) return;
    setStartingFor({ weaverName: w.name, assignmentId: w.pending.id });
    setStartDate(todayStr());
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!startingFor) return;
    setStartSaving(true);
    const result = await recordWarpStartDate({ warpAssignmentId: startingFor.assignmentId, warpStartDate: startDate });
    setStartSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Warp started');
    setStartingFor(null);
  }

  const allowedSareeTypes = assigning
    ? sareeTypes.filter((s) => assigning.sareeTypeIds.length === 0 || assigning.sareeTypeIds.includes(s.id))
    : [];

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Weaver</th>
              <th className="px-4 py-3">Saree Type</th>
              <th className="px-4 py-3">Current Warp</th>
              <th className="px-4 py-3">Next Warp</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {weavers.map((w) => {
              const progress = w.current?.receivedCount ?? 0;
              const alert = !!w.current && progress >= 18 && progress < 24;
              const canAssign = !w.pending && (!w.current || progress >= 18);
              return (
                <tr key={w.id} className="border-t border-brand-50">
                  <td className="px-4 py-3 font-medium text-ink">{w.name}</td>
                  <td className="px-4 py-3 text-ink/70">{w.current?.sareeTypeName ?? '—'}</td>
                  <td className="px-4 py-3">
                    {w.current ? (
                      <div className="flex items-center gap-2">
                        <span className="text-ink/70">{progress} / 24</span>
                        {alert && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            Warp Alert
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink/40">No warp assigned</span>
                    )}
                    {w.awaitingCut && (
                      <p className="mt-0.5 text-xs text-amber-700">
                        Previous {w.awaitingCut.sareeTypeName} warp: 24/24 woven, awaiting cut on Saree Receiving.
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {w.pending ? (
                      <span>
                        {w.pending.sareeTypeName} —{' '}
                        {w.pending.status === 'WAITING_TO_START' ? 'waiting to start' : 'prepared'}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canAssign && (
                      <button onClick={() => openAssign(w)} className="text-brand-700 hover:underline">
                        Assign Warp
                      </button>
                    )}
                    {w.pending && (
                      <button onClick={() => openStart(w)} className="ml-3 text-brand-700 hover:underline">
                        Enter start date
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {weavers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink/40">
                  No active weavers.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!assigning} onClose={() => setAssigning(null)} title={`Assign warp — ${assigning?.name ?? ''}`}>
        <form onSubmit={handleAssign} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Saree type">
              <Select value={sareeTypeId} onChange={(e) => setSareeTypeId(e.target.value)} required>
                {allowedSareeTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assignment date">
              <TextInput type="date" value={assignmentDate} onChange={(e) => setAssignmentDate(e.target.value)} required />
            </Field>
          </div>

          <Field label="Warp to assign (whole warp, whatever shades it contains)">
            {availableWarps.length === 0 ? (
              <p className="text-sm text-ink/60">
                No dyed warp available right now — receive one on Warp Dyeing first.
              </p>
            ) : (
              <Select value={dyeingBatchWarpId} onChange={(e) => selectWarp(e.target.value)} required>
                {availableWarps.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {shadeOrder.length > 0 && (
            <Field label="Colour order along the warp (top = start) — arrange to match Jari/Weft handover">
              <div className="space-y-1 rounded-lg border border-brand-100 p-2">
                {shadeOrder.map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md bg-brand-50 px-3 py-1.5 text-sm">
                    <span className="text-ink">
                      {i + 1}. {s.shadeNumber} <span className="text-ink/50">×{s.quantity}</span>
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveShade(i, -1)}
                        disabled={i === 0}
                        className="rounded px-1.5 text-ink/60 hover:bg-brand-100 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveShade(i, 1)}
                        disabled={i === shadeOrder.length - 1}
                        className="rounded px-1.5 text-ink/60 hover:bg-brand-100 disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Field>
          )}

          <Field label="Remarks">
            <TextArea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>

          <p className="text-xs text-ink/50">
            Assigning prepares the next warp — it does not start it. Enter the actual start date separately once the
            weaver physically joins it.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setAssigning(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={assignSaving || availableWarps.length === 0}>
              {assignSaving ? 'Saving…' : 'Assign warp'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal open={!!startingFor} onClose={() => setStartingFor(null)} title={`Start warp — ${startingFor?.weaverName ?? ''}`}>
        <form onSubmit={handleStart} className="space-y-3">
          <Field label="Actual date the weaver starts this warp">
            <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setStartingFor(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={startSaving}>
              {startSaving ? 'Saving…' : 'Start warp'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

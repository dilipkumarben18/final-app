'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Scissors } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { receiveSaree, unreceiveSaree, markTwentyFourthWoven, updateSareeDetails } from '@/lib/actions/sareeReceiving';
import { cutAndReceiveTwentyFourth } from '@/lib/actions/warpAssignments';

type Row = {
  id: string;
  weaverId: string;
  weaverName: string;
  sareeTypeId: string;
  sareeTypeName: string;
  locationId: string;
  godownName: string;
  receivedNumbers: number[];
  twentyFourthWoven: boolean;
  canCutTwentyFourth: boolean;
};

const NUMBERS = Array.from({ length: 23 }, (_, i) => i + 1);

export function SareeReceivingClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<{ row: Row; n: number } | null>(null);
  const [undoing, setUndoing] = useState(false);

  const [detailsFor, setDetailsFor] = useState<{
    id: string;
    serialNumber: string;
    weaverName: string;
    sareeNumber: number;
  } | null>(null);
  const [weightGram, setWeightGram] = useState('');
  const [designName, setDesignName] = useState('');
  const [warpColour, setWarpColour] = useState('');
  const [weftColour, setWeftColour] = useState('');
  const [jariColour, setJariColour] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  function cellKey(assignmentId: string, n: number) {
    return `${assignmentId}-${n}`;
  }

  async function handleTick(row: Row, n: number) {
    setBusyCell(cellKey(row.id, n));
    const result = await receiveSaree({ warpAssignmentId: row.id, sareeNumber: n });
    setBusyCell(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.id && result.serialNumber) {
      setDetailsFor({ id: result.id, serialNumber: result.serialNumber, weaverName: row.weaverName, sareeNumber: n });
      setWeightGram('');
      setDesignName('');
      setWarpColour(result.warpColour ?? '');
      setWeftColour(result.weftColour ?? '');
      setJariColour(result.jariColour ?? '');
    }
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!detailsFor) return;
    setSavingDetails(true);
    const result = await updateSareeDetails({
      id: detailsFor.id,
      weightGram: weightGram || undefined,
      designName,
      warpColour,
      weftColour,
      jariColour,
    });
    setSavingDetails(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Saree details saved');
    setDetailsFor(null);
  }

  function handleCellClick(row: Row, n: number) {
    if (row.receivedNumbers.includes(n)) {
      setConfirmFor({ row, n });
    } else {
      startTransition(() => handleTick(row, n));
    }
  }

  async function handleUnreceive() {
    if (!confirmFor) return;
    setUndoing(true);
    const result = await unreceiveSaree({ warpAssignmentId: confirmFor.row.id, sareeNumber: confirmFor.n });
    setUndoing(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Saree ${confirmFor.n} un-received`);
    setConfirmFor(null);
  }

  function handleMarkDamagedInstead() {
    if (!confirmFor) return;
    const { row } = confirmFor;
    const params = new URLSearchParams({
      locationId: row.locationId,
      sareeTypeId: row.sareeTypeId,
      weaverId: row.weaverId,
    });
    setConfirmFor(null);
    router.push(`/damage?${params.toString()}`);
  }

  async function handleMarkWoven(assignmentId: string) {
    setBusyCell(cellKey(assignmentId, 24));
    const result = await markTwentyFourthWoven({ warpAssignmentId: assignmentId });
    setBusyCell(null);
    if (result.error) toast.error(result.error);
    else toast.success('24th saree marked woven — held on the machine until the new warp starts');
  }

  async function handleCut(assignmentId: string) {
    setBusyCell(cellKey(assignmentId, 24));
    const result = await cutAndReceiveTwentyFourth({ warpAssignmentId: assignmentId });
    setBusyCell(null);
    if (result.error) toast.error(result.error);
    else toast.success('24th saree cut and received into stock');
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-ink/60">
        No warps are currently in progress — assign and start a warp first on the Warp Alerts page.
      </p>
    );
  }

  return (
    <>
    <div className="overflow-x-auto rounded-2xl border border-brand-100 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-brand-50 text-xs uppercase text-ink/50">
          <tr>
            <th className="sticky left-0 z-10 bg-brand-50 px-4 py-3">Weaver</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Godown</th>
            {NUMBERS.map((n) => (
              <th key={n} className="w-12 px-1 py-3 text-center">
                {n}
              </th>
            ))}
            <th className="w-20 px-1 py-3 text-center">24</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-brand-50">
              <td className="sticky left-0 z-10 bg-white px-4 py-2 font-medium text-ink">{row.weaverName}</td>
              <td className="px-4 py-2 text-ink/70">{row.sareeTypeName}</td>
              <td className="px-4 py-2 text-ink/70">{row.godownName}</td>
              {NUMBERS.map((n) => {
                const received = row.receivedNumbers.includes(n);
                const busy = busyCell === cellKey(row.id, n);
                return (
                  <td key={n} className="px-1 py-2 text-center">
                    <button
                      disabled={busy || pending}
                      onClick={() => handleCellClick(row, n)}
                      className={`flex h-11 w-11 touch-manipulation items-center justify-center rounded-md text-sm font-medium transition ${
                        received
                          ? 'bg-green-500 text-white hover:bg-green-600 active:bg-green-700'
                          : 'border border-brand-100 text-ink/40 hover:bg-brand-50 active:bg-brand-100 disabled:opacity-50'
                      }`}
                      title={received ? `Saree ${n} received — click to undo or mark damaged` : `Mark saree ${n} received`}
                    >
                      {received ? <Check size={18} /> : n}
                    </button>
                  </td>
                );
              })}
              <td className="px-1 py-2 text-center">
                {row.canCutTwentyFourth ? (
                  <button
                    disabled={busyCell === cellKey(row.id, 24)}
                    onClick={() => startTransition(() => handleCut(row.id))}
                    className="flex h-11 w-20 touch-manipulation items-center justify-center gap-1 rounded-md bg-blue-500 text-xs font-medium text-white hover:bg-blue-600 active:bg-blue-700"
                    title="New warp has started — cut and receive the 24th"
                  >
                    <Scissors size={14} /> Cut
                  </button>
                ) : row.twentyFourthWoven ? (
                  <span
                    className="flex h-11 w-20 items-center justify-center rounded-md bg-amber-100 text-[10px] font-medium leading-tight text-amber-700"
                    title="Woven, held on the machine until the new warp starts"
                  >
                    Awaiting changeover
                  </span>
                ) : (
                  <button
                    disabled={row.receivedNumbers.length < 23 || busyCell === cellKey(row.id, 24)}
                    onClick={() => startTransition(() => handleMarkWoven(row.id))}
                    className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-md border border-brand-100 text-sm font-medium text-ink/40 hover:bg-brand-50 active:bg-brand-100 disabled:opacity-40"
                    title={row.receivedNumbers.length < 23 ? 'Complete sarees 1-23 first' : 'Mark 24th saree woven'}
                  >
                    24
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <Modal
      open={!!confirmFor}
      onClose={() => setConfirmFor(null)}
      title={confirmFor ? `Saree ${confirmFor.n} — ${confirmFor.row.weaverName}` : ''}
    >
      <div className="space-y-4">
        <p className="text-sm text-ink/70">
          This saree is already marked received. Was it ticked by mistake, or does it need to go to the damage register?
        </p>
        <div className="flex flex-col gap-2">
          <SecondaryButton type="button" onClick={handleUnreceive} disabled={undoing}>
            {undoing ? 'Undoing…' : 'Unreceive (undo mis-click)'}
          </SecondaryButton>
          <PrimaryButton type="button" onClick={handleMarkDamagedInstead}>
            Mark as Damaged
          </PrimaryButton>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setConfirmFor(null)}
            className="text-sm text-ink/50 hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>

    <Modal
      open={!!detailsFor}
      onClose={() => setDetailsFor(null)}
      title={detailsFor ? `Saree ${detailsFor.sareeNumber} — ${detailsFor.serialNumber}` : ''}
    >
      {detailsFor && (
        <form onSubmit={handleSaveDetails} className="space-y-3">
          <p className="text-xs text-ink/50">
            Received for {detailsFor.weaverName}. Add weight, design and confirm colours now, or skip — you can fill
            these in later from the Saree Book.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight (grams)">
              <TextInput type="number" min={0} step="1" value={weightGram} onChange={(e) => setWeightGram(e.target.value)} />
            </Field>
            <Field label="Design">
              <TextInput value={designName} onChange={(e) => setDesignName(e.target.value)} placeholder="e.g. Temple border" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Warp colour">
              <TextInput value={warpColour} onChange={(e) => setWarpColour(e.target.value)} />
            </Field>
            <Field label="Weft colour">
              <TextInput value={weftColour} onChange={(e) => setWeftColour(e.target.value)} />
            </Field>
            <Field label="Jari colour">
              <TextInput value={jariColour} onChange={(e) => setJariColour(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setDetailsFor(null)}>
              Skip for now
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={savingDetails}>
              {savingDetails ? 'Saving…' : 'Save details'}
            </PrimaryButton>
          </div>
        </form>
      )}
    </Modal>
    </>
  );
}

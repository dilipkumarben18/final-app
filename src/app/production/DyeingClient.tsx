'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Copy } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, TextArea, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { sendForDyeing, receiveDyedWarp } from '@/lib/actions/dyeing';

type WarpMaterial = { id: string; name: string; currentStock: string };
type ShadeLine = { id: string; shadeNumber: string; sentQuantity: number; receivedQuantity: number | null };
type Warp = { id: string; warpIndex: number; receivedAt: string | null; shadeLines: ShadeLine[] };
type Batch = {
  id: string;
  reference: string;
  rawMaterialName: string;
  warpCount: number;
  sentDate: string;
  status: 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED';
  remarks: string | null;
  partyName: string | null;
  charges: string | null;
  expectedReturnDate: string | null;
  warps: Warp[];
};
type DyeingParty = { id: string; name: string };
type AvailableWarpShadeLine = { id: string; shadeNumber: string; receivedQuantity: number };
type AvailableWarp = {
  id: string;
  batchReference: string;
  warpIndex: number;
  receivedAt: string;
  shadeLines: AvailableWarpShadeLine[];
};

type FormShadeLine = { shadeNumber: string; quantity: string };
type FormWarp = { shadeLines: FormShadeLine[] };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_LABELS: Record<Batch['status'], string> = {
  SENT: 'Sent',
  PARTIALLY_RECEIVED: 'Partially Received',
  RECEIVED: 'Received',
};
const STATUS_COLORS: Record<Batch['status'], string> = {
  SENT: 'bg-blue-100 text-blue-700',
  PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-700',
  RECEIVED: 'bg-green-100 text-green-700',
};

function emptyWarp(): FormWarp {
  return { shadeLines: [{ shadeNumber: '', quantity: '24' }] };
}

export function DyeingClient({
  warpMaterials,
  batches,
  availableWarps,
  dyeingParties,
}: {
  warpMaterials: WarpMaterial[];
  batches: Batch[];
  availableWarps: AvailableWarp[];
  dyeingParties: DyeingParty[];
}) {
  const [rawMaterialId, setRawMaterialId] = useState(warpMaterials[0]?.id ?? '');
  const [sentDate, setSentDate] = useState(todayStr());
  const [remarks, setRemarks] = useState('');
  const [warps, setWarps] = useState<FormWarp[]>([emptyWarp()]);
  const [sending, setSending] = useState(false);
  const [dyeingPartyId, setDyeingPartyId] = useState('');
  const [charges, setCharges] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');

  const [receiving, setReceiving] = useState<{ batch: Batch; warp: Warp } | null>(null);
  const [receivedDate, setReceivedDate] = useState(todayStr());
  const [receiveRemarks, setReceiveRemarks] = useState('');
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({});
  const [receiveShades, setReceiveShades] = useState<Record<string, string>>({});
  const [receiveSaving, setReceiveSaving] = useState(false);

  function setWarpCount(count: number) {
    setWarps((prev) => {
      const next = [...prev];
      while (next.length < count) next.push(emptyWarp());
      while (next.length > count) next.pop();
      return next;
    });
  }

  function updateShade(warpIdx: number, lineIdx: number, patch: Partial<FormShadeLine>) {
    setWarps((prev) =>
      prev.map((w, wi) =>
        wi !== warpIdx ? w : { shadeLines: w.shadeLines.map((l, li) => (li === lineIdx ? { ...l, ...patch } : l)) }
      )
    );
  }
  function addShadeLine(warpIdx: number) {
    setWarps((prev) =>
      prev.map((w, wi) => (wi !== warpIdx ? w : { shadeLines: [...w.shadeLines, { shadeNumber: '', quantity: '' }] }))
    );
  }
  function removeShadeLine(warpIdx: number, lineIdx: number) {
    setWarps((prev) =>
      prev.map((w, wi) => (wi !== warpIdx ? w : { shadeLines: w.shadeLines.filter((_, li) => li !== lineIdx) }))
    );
  }
  function copyFirstWarpToAll() {
    setWarps((prev) => prev.map((w, i) => (i === 0 ? w : { shadeLines: prev[0].shadeLines.map((l) => ({ ...l })) })));
  }

  function warpTotal(w: FormWarp) {
    return w.shadeLines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const result = await sendForDyeing({
      rawMaterialId,
      sentDate,
      remarks,
      warps,
      partyId: dyeingPartyId || undefined,
      charges: charges || undefined,
      expectedReturnDate: expectedReturnDate || undefined,
    });
    setSending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Sent for dyeing');
    setWarps([emptyWarp()]);
    setRemarks('');
    setDyeingPartyId('');
    setCharges('');
    setExpectedReturnDate('');
  }

  function openReceive(batch: Batch, warp: Warp) {
    setReceiving({ batch, warp });
    setReceivedDate(todayStr());
    setReceiveRemarks('');
    setReceiveQtys(Object.fromEntries(warp.shadeLines.map((l) => [l.id, String(l.sentQuantity)])));
    setReceiveShades(Object.fromEntries(warp.shadeLines.map((l) => [l.id, l.shadeNumber])));
  }

  async function handleReceive(e: React.FormEvent) {
    e.preventDefault();
    if (!receiving) return;
    setReceiveSaving(true);
    const result = await receiveDyedWarp({
      dyeingBatchWarpId: receiving.warp.id,
      receivedDate,
      remarks: receiveRemarks,
      shadeReceipts: receiving.warp.shadeLines.map((l) => ({
        shadeLineId: l.id,
        shadeNumber: receiveShades[l.id] || '',
        receivedQuantity: receiveQtys[l.id] || '0',
      })),
    });
    setReceiveSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Dyed warp received');
    setReceiving(null);
  }

  const pendingWarps = batches.flatMap((b) => b.warps.filter((w) => !w.receivedAt).map((w) => ({ batch: b, warp: w })));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-lg font-semibold text-ink">Dyed Warp Stock</h2>
        <p className="mt-1 text-sm text-ink/60">
          Each card is one physical warp, received and not yet assigned — the whole card goes to one weaver on
          Warp Alerts &amp; Assignment.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {availableWarps.map((w) => (
            <div key={w.id} className="rounded-2xl border border-brand-100 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">
                  {w.batchReference} · Warp {w.warpIndex}
                </p>
                <span className="text-xs text-ink/50">{new Date(w.receivedAt).toLocaleDateString()}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {w.shadeLines.map((l) => (
                  <span
                    key={l.id}
                    className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
                  >
                    {l.shadeNumber || 'Shade TBD'} × {l.receivedQuantity}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {availableWarps.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-ink/40">
              No dyed warp available right now — receive one below once it's back from dyeing.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">Send Warp for Dyeing</h2>
        {warpMaterials.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">
            No Warp-category raw material configured yet — add one in Settings → Raw Materials first.
          </p>
        ) : (
          <form onSubmit={handleSend} className="mt-3 max-w-3xl space-y-3 rounded-2xl border border-brand-100 bg-white p-5">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Raw warp material">
                <Select value={rawMaterialId} onChange={(e) => setRawMaterialId(e.target.value)} required>
                  {warpMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.currentStock} in stock)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date">
                <TextInput type="date" value={sentDate} onChange={(e) => setSentDate(e.target.value)} required />
              </Field>
              <Field label="Number of warps">
                <TextInput
                  type="number"
                  min={1}
                  value={warps.length}
                  onChange={(e) => setWarpCount(Math.max(1, Number(e.target.value) || 1))}
                  required
                />
              </Field>
            </div>
            <p className="text-xs text-ink/50">Total sarees: {warps.length * 24}</p>

            {dyeingParties.length > 0 && (
              <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3">
                <p className="text-xs font-medium text-ink/70">Dyeing billing (optional)</p>
                <div className="mt-2 grid grid-cols-3 gap-3">
                  <Field label="Dyeing house">
                    <Select value={dyeingPartyId} onChange={(e) => setDyeingPartyId(e.target.value)}>
                      <option value="">Not tracked</option>
                      {dyeingParties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Charges (₹)">
                    <TextInput
                      type="number"
                      min={0}
                      step="0.01"
                      value={charges}
                      onChange={(e) => setCharges(e.target.value)}
                      disabled={!dyeingPartyId}
                    />
                  </Field>
                  <Field label="Expected return">
                    <TextInput
                      type="date"
                      value={expectedReturnDate}
                      onChange={(e) => setExpectedReturnDate(e.target.value)}
                      disabled={!dyeingPartyId}
                    />
                  </Field>
                </div>
              </div>
            )}

            {warps.length > 1 && (
              <button
                type="button"
                onClick={copyFirstWarpToAll}
                className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
              >
                <Copy size={14} /> Apply Warp 1&apos;s shades to all warps
              </button>
            )}

            <div className="space-y-4">
              {warps.map((w, wi) => {
                const total = warpTotal(w);
                return (
                  <div key={wi} className="rounded-xl border border-brand-100 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-ink">Warp {wi + 1}</p>
                      <span className={`text-xs font-medium ${total === 24 ? 'text-green-700' : 'text-red-600'}`}>
                        {total} / 24
                      </span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {w.shadeLines.map((line, li) => (
                        <div key={li} className="grid grid-cols-12 items-center gap-2">
                          <div className="col-span-7">
                            <TextInput
                              placeholder="Shade number (optional)"
                              value={line.shadeNumber}
                              onChange={(e) => updateShade(wi, li, { shadeNumber: e.target.value })}
                            />
                          </div>
                          <div className="col-span-4">
                            <TextInput
                              type="number"
                              min={1}
                              placeholder="Sarees"
                              value={line.quantity}
                              onChange={(e) => updateShade(wi, li, { quantity: e.target.value })}
                              required
                            />
                          </div>
                          <div className="col-span-1 text-right">
                            {w.shadeLines.length > 1 && (
                              <button type="button" onClick={() => removeShadeLine(wi, li)} className="text-ink/40 hover:text-red-600">
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addShadeLine(wi)}
                        className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                      >
                        <Plus size={14} /> Add shade
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <Field label="Remarks">
              <TextArea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>

            <div className="flex justify-end">
              <PrimaryButton type="submit" disabled={sending}>
                {sending ? 'Sending…' : 'Send for dyeing'}
              </PrimaryButton>
            </div>
          </form>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">Dyeing In Progress</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-brand-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase text-ink/50">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Warp #</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Shades</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pendingWarps.map(({ batch, warp }) => (
                <tr key={warp.id} className="border-t border-brand-50">
                  <td className="px-4 py-3 font-medium text-ink">{batch.reference}</td>
                  <td className="px-4 py-3 text-ink/70">{warp.warpIndex}</td>
                  <td className="px-4 py-3 text-ink/70">{new Date(batch.sentDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {warp.shadeLines.map((l) => `${l.shadeNumber || 'Shade TBD'} (${l.sentQuantity})`).join(', ')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openReceive(batch, warp)} className="text-brand-700 hover:underline">
                      Receive
                    </button>
                  </td>
                </tr>
              ))}
              {pendingWarps.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink/40">
                    Nothing currently out for dyeing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">Dyeing History</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-brand-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase text-ink/50">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Raw material</th>
                <th className="px-4 py-3">Warps</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Dyeing house</th>
                <th className="px-4 py-3">Charges</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-brand-50">
                  <td className="px-4 py-3 font-medium text-ink">{b.reference}</td>
                  <td className="px-4 py-3 text-ink/70">{b.rawMaterialName}</td>
                  <td className="px-4 py-3 text-ink/70">{b.warpCount}</td>
                  <td className="px-4 py-3 text-ink/70">{new Date(b.sentDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-ink/70">{b.partyName ?? '—'}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {b.charges ? `₹${Number(b.charges).toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[b.status]}`}>
                      {STATUS_LABELS[b.status]}
                    </span>
                  </td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink/40">
                    No dyeing batches yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={!!receiving}
        onClose={() => setReceiving(null)}
        title={`Receive ${receiving?.batch.reference ?? ''} — Warp ${receiving?.warp.warpIndex ?? ''}`}
      >
        <form onSubmit={handleReceive} className="space-y-3">
          <Field label="Received date">
            <TextInput type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} required />
          </Field>
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink/80">Shade &amp; received quantity</p>
            {receiving?.warp.shadeLines.map((l) => (
              <div key={l.id} className="grid grid-cols-12 items-center gap-2">
                <div className="col-span-7">
                  <TextInput
                    placeholder="Shade number"
                    value={receiveShades[l.id] ?? ''}
                    onChange={(e) => setReceiveShades({ ...receiveShades, [l.id]: e.target.value })}
                  />
                </div>
                <span className="col-span-2 text-xs text-ink/50">sent {l.sentQuantity}</span>
                <div className="col-span-3">
                  <TextInput
                    type="number"
                    min={0}
                    value={receiveQtys[l.id] ?? ''}
                    onChange={(e) => setReceiveQtys({ ...receiveQtys, [l.id]: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
          <Field label="Remarks">
            <TextArea rows={2} value={receiveRemarks} onChange={(e) => setReceiveRemarks(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setReceiving(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={receiveSaving}>
              {receiveSaving ? 'Saving…' : 'Receive'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

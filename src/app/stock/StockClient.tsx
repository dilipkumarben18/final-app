'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRightLeft, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, TextArea, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { createTransfer } from '@/lib/actions/stockTransfers';
import { adjustRawMaterialStock, adjustFinishedStock } from '@/lib/actions/stockAdjustment';

type Direction = 'ADD' | 'SUBTRACT';

type RawMaterial = {
  id: string;
  name: string;
  unit: string;
  currentStock: string;
  lowStockLevel: string | null;
  latestRate: number | null;
};
type Balance = {
  id: string;
  locationName: string;
  sareeTypeName: string;
  state: string;
  quantity: number;
  costPrice: number | null;
};

function formatMoney(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
type Location = { id: string; name: string };
type SareeType = { id: string; name: string };

function DirectionToggle({ value, onChange }: { value: Direction; onChange: (d: Direction) => void }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange('ADD')}
        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
          value === 'ADD' ? 'border-brand-500 bg-brand-500 text-white' : 'border-brand-100 text-ink/60 hover:bg-brand-50'
        }`}
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => onChange('SUBTRACT')}
        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
          value === 'SUBTRACT' ? 'border-red-500 bg-red-500 text-white' : 'border-brand-100 text-ink/60 hover:bg-brand-50'
        }`}
      >
        Subtract
      </button>
    </div>
  );
}

export function StockClient({
  rawMaterials,
  balances,
  godowns,
  homes,
  sareeTypes,
  canTransfer,
  isMaster,
}: {
  rawMaterials: RawMaterial[];
  balances: Balance[];
  godowns: Location[];
  homes: Location[];
  sareeTypes: SareeType[];
  canTransfer: boolean;
  isMaster: boolean;
}) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [fromLocationId, setFromLocationId] = useState(godowns[0]?.id ?? '');
  const [toLocationId, setToLocationId] = useState(homes[0]?.id ?? '');
  const [sareeTypeId, setSareeTypeId] = useState(sareeTypes[0]?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const allLocations = [...godowns, ...homes];

  const [adjustRawOpen, setAdjustRawOpen] = useState(false);
  const [adjustRawMaterialId, setAdjustRawMaterialId] = useState(rawMaterials[0]?.id ?? '');
  const [adjustRawDirection, setAdjustRawDirection] = useState<Direction>('ADD');
  const [adjustRawQty, setAdjustRawQty] = useState('');
  const [adjustRawNotes, setAdjustRawNotes] = useState('');
  const [adjustRawSaving, setAdjustRawSaving] = useState(false);

  const [adjustFinishedOpen, setAdjustFinishedOpen] = useState(false);
  const [adjustLocationId, setAdjustLocationId] = useState(allLocations[0]?.id ?? '');
  const [adjustSareeTypeId, setAdjustSareeTypeId] = useState(sareeTypes[0]?.id ?? '');
  const [adjustFinishedDirection, setAdjustFinishedDirection] = useState<Direction>('ADD');
  const [adjustFinishedQty, setAdjustFinishedQty] = useState('');
  const [adjustFinishedSaving, setAdjustFinishedSaving] = useState(false);

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await createTransfer({ fromLocationId, toLocationId, sareeTypeId, quantity, notes });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Stock transferred to home');
    setTransferOpen(false);
    setQuantity('1');
    setNotes('');
  }

  function openAdjustRaw() {
    setAdjustRawMaterialId(rawMaterials[0]?.id ?? '');
    setAdjustRawDirection('ADD');
    setAdjustRawQty('');
    setAdjustRawNotes('');
    setAdjustRawOpen(true);
  }

  async function handleAdjustRawSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAdjustRawSaving(true);
    const result = await adjustRawMaterialStock({
      rawMaterialId: adjustRawMaterialId,
      direction: adjustRawDirection,
      quantity: adjustRawQty,
      notes: adjustRawNotes,
    });
    setAdjustRawSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Stock adjusted');
    setAdjustRawOpen(false);
  }

  function openAdjustFinished() {
    setAdjustLocationId(allLocations[0]?.id ?? '');
    setAdjustSareeTypeId(sareeTypes[0]?.id ?? '');
    setAdjustFinishedDirection('ADD');
    setAdjustFinishedQty('');
    setAdjustFinishedOpen(true);
  }

  async function handleAdjustFinishedSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAdjustFinishedSaving(true);
    const result = await adjustFinishedStock({
      locationId: adjustLocationId,
      sareeTypeId: adjustSareeTypeId,
      direction: adjustFinishedDirection,
      quantity: adjustFinishedQty,
    });
    setAdjustFinishedSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Stock adjusted');
    setAdjustFinishedOpen(false);
  }

  const canOpenTransfer = canTransfer && godowns.length > 0 && homes.length > 0 && sareeTypes.length > 0;

  const rawMaterialTotal = rawMaterials.reduce(
    (sum, rm) => sum + (rm.latestRate !== null ? Number(rm.currentStock) * rm.latestRate : 0),
    0
  );
  const finishedStockTotal = balances.reduce(
    (sum, b) => sum + (b.costPrice !== null ? b.quantity * b.costPrice : 0),
    0
  );

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Raw material stock</h2>
          {isMaster && (
            <button
              onClick={openAdjustRaw}
              disabled={rawMaterials.length === 0}
              className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline disabled:cursor-not-allowed disabled:text-ink/30 disabled:no-underline"
            >
              <Plus size={14} /> Adjust stock
            </button>
          )}
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl border border-brand-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase text-ink/50">
              <tr>
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3">Current stock</th>
                <th className="px-4 py-3">Low stock level</th>
                <th className="px-4 py-3">Value</th>
              </tr>
            </thead>
            <tbody>
              {rawMaterials.map((rm) => {
                const low = rm.lowStockLevel !== null && Number(rm.currentStock) <= Number(rm.lowStockLevel);
                const value = rm.latestRate !== null ? Number(rm.currentStock) * rm.latestRate : null;
                return (
                  <tr key={rm.id} className="border-t border-brand-50">
                    <td className="px-4 py-3 font-medium text-ink">{rm.name}</td>
                    <td className={`px-4 py-3 ${low ? 'font-medium text-red-600' : 'text-ink/70'}`}>
                      {rm.currentStock} {rm.unit}
                    </td>
                    <td className="px-4 py-3 text-ink/70">{rm.lowStockLevel ?? '—'}</td>
                    <td className="px-4 py-3 text-ink/70">{value !== null ? `₹${formatMoney(value)}` : '—'}</td>
                  </tr>
                );
              })}
              {rawMaterials.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink/40">
                    No raw materials yet.
                  </td>
                </tr>
              )}
            </tbody>
            {rawMaterials.length > 0 && (
              <tfoot>
                <tr className="border-t border-brand-100 bg-brand-50/50">
                  <td className="px-4 py-2.5 text-xs font-semibold uppercase text-ink/50" colSpan={3}>
                    Total (priced materials only)
                  </td>
                  <td className="px-4 py-2.5 text-sm font-semibold text-ink">₹{formatMoney(rawMaterialTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Finished saree stock</h2>
          <div className="flex items-center gap-4">
            {isMaster && (
              <button
                onClick={openAdjustFinished}
                disabled={allLocations.length === 0 || sareeTypes.length === 0}
                className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline disabled:cursor-not-allowed disabled:text-ink/30 disabled:no-underline"
              >
                <Plus size={14} /> Adjust stock
              </button>
            )}
            {canTransfer && (
              <button
                onClick={() => setTransferOpen(true)}
                disabled={!canOpenTransfer}
                className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline disabled:cursor-not-allowed disabled:text-ink/30 disabled:no-underline"
              >
                <ArrowRightLeft size={14} /> Godown → Home transfer
              </button>
            )}
          </div>
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl border border-brand-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase text-ink/50">
              <tr>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Saree type</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Value</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => {
                const value = b.costPrice !== null ? b.quantity * b.costPrice : null;
                return (
                  <tr key={b.id} className="border-t border-brand-50">
                    <td className="px-4 py-3 font-medium text-ink">{b.locationName}</td>
                    <td className="px-4 py-3 text-ink/70">{b.sareeTypeName}</td>
                    <td className="px-4 py-3 text-ink/70">{b.state}</td>
                    <td className="px-4 py-3 text-ink/70">{b.quantity}</td>
                    <td className="px-4 py-3 text-ink/70">{value !== null ? `₹${formatMoney(value)}` : '—'}</td>
                  </tr>
                );
              })}
              {balances.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink/40">
                    No finished stock yet.
                  </td>
                </tr>
              )}
            </tbody>
            {balances.length > 0 && (
              <tfoot>
                <tr className="border-t border-brand-100 bg-brand-50/50">
                  <td className="px-4 py-2.5 text-xs font-semibold uppercase text-ink/50" colSpan={4}>
                    Total (priced saree types only)
                  </td>
                  <td className="px-4 py-2.5 text-sm font-semibold text-ink">₹{formatMoney(finishedStockTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Godown → Home transfer">
        <form onSubmit={handleTransfer} className="space-y-3">
          <Field label="From godown">
            <Select value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)} required>
              {godowns.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To home stock">
            <Select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)} required>
              {homes.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Saree type">
            <Select value={sareeTypeId} onChange={(e) => setSareeTypeId(e.target.value)} required>
              {sareeTypes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity">
            <TextInput type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </Field>
          <Field label="Notes">
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setTransferOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Transferring…' : 'Transfer'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal open={adjustRawOpen} onClose={() => setAdjustRawOpen(false)} title="Adjust raw material stock">
        <form onSubmit={handleAdjustRawSubmit} className="space-y-3">
          <Field label="Raw material">
            <Select value={adjustRawMaterialId} onChange={(e) => setAdjustRawMaterialId(e.target.value)} required>
              {rawMaterials.map((rm) => (
                <option key={rm.id} value={rm.id}>
                  {rm.name} ({rm.currentStock} {rm.unit} currently)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Direction">
            <DirectionToggle value={adjustRawDirection} onChange={setAdjustRawDirection} />
          </Field>
          <Field label="Quantity">
            <TextInput
              type="number"
              min={0.001}
              step="0.001"
              value={adjustRawQty}
              onChange={(e) => setAdjustRawQty(e.target.value)}
              required
            />
          </Field>
          <Field label="Notes (optional)">
            <TextArea rows={2} value={adjustRawNotes} onChange={(e) => setAdjustRawNotes(e.target.value)} />
          </Field>
          <p className="text-xs text-ink/50">
            Adds to or subtracts from current stock directly — no Purchase behind it, no reason required. Use this
            for opening stock, count corrections, or anything else that doesn't fit a normal purchase/return.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setAdjustRawOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={adjustRawSaving}>
              {adjustRawSaving ? 'Saving…' : 'Adjust stock'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal open={adjustFinishedOpen} onClose={() => setAdjustFinishedOpen(false)} title="Adjust saree stock">
        <form onSubmit={handleAdjustFinishedSubmit} className="space-y-3">
          <Field label="Location">
            <Select value={adjustLocationId} onChange={(e) => setAdjustLocationId(e.target.value)} required>
              {allLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Saree type">
            <Select value={adjustSareeTypeId} onChange={(e) => setAdjustSareeTypeId(e.target.value)} required>
              {sareeTypes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Direction">
            <DirectionToggle value={adjustFinishedDirection} onChange={setAdjustFinishedDirection} />
          </Field>
          <Field label="Quantity">
            <TextInput
              type="number"
              min={1}
              value={adjustFinishedQty}
              onChange={(e) => setAdjustFinishedQty(e.target.value)}
              required
            />
          </Field>
          <p className="text-xs text-ink/50">
            Adds to or subtracts from Normal stock at this location directly — no Sale, Purchase, or Transfer behind
            it, no reason required.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setAdjustFinishedOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={adjustFinishedSaving}>
              {adjustFinishedSaving ? 'Saving…' : 'Adjust stock'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

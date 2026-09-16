'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, TextArea, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { createOrder, markWarpDyeing, markWeaving, markReady, markDelivered, cancelOrder } from '@/lib/actions/orders';

type OrderStatus = 'ORDER_PLACED' | 'WARP_DYEING' | 'WEAVING' | 'READY' | 'DELIVERED' | 'CANCELLED';

type Order = {
  id: string;
  orderNumber: string;
  partyName: string;
  partyMobile: string | null;
  sareeTypeName: string;
  quantity: number;
  rate: string;
  totalAmount: string;
  warpColour: string | null;
  weftColour: string | null;
  jariColour: string | null;
  description: string | null;
  dueDate: string | null;
  notes: string | null;
  status: OrderStatus;
  createdAt: string;
};

type Party = { id: string; name: string; mobile: string | null; address: string | null };
type SareeType = { id: string; name: string };

const STATUS_LABELS: Record<OrderStatus, string> = {
  ORDER_PLACED: 'Order Placed',
  WARP_DYEING: 'Warp Dyeing',
  WEAVING: 'Weaving',
  READY: 'Ready',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  ORDER_PLACED: 'bg-blue-100 text-blue-700',
  WARP_DYEING: 'bg-amber-100 text-amber-700',
  WEAVING: 'bg-amber-100 text-amber-700',
  READY: 'bg-green-100 text-green-700',
  DELIVERED: 'bg-ink/10 text-ink/50',
  CANCELLED: 'bg-red-100 text-red-700',
};

const emptyForm = {
  partyId: '',
  sareeTypeId: '',
  quantity: '1',
  rate: '',
  warpColour: '',
  weftColour: '',
  jariColour: '',
  description: '',
  dueDate: '',
  notes: '',
};

export function OrdersClient({
  orders,
  parties,
  sareeTypes,
}: {
  orders: Order[];
  parties: Party[];
  sareeTypes: SareeType[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    ...emptyForm,
    partyId: parties[0]?.id ?? '',
    sareeTypeId: sareeTypes[0]?.id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const selectedParty = parties.find((p) => p.id === form.partyId);
  const total = (Number(form.quantity) || 0) * (Number(form.rate) || 0);

  function openAdd() {
    setForm({ ...emptyForm, partyId: parties[0]?.id ?? '', sareeTypeId: sareeTypes[0]?.id ?? '' });
    setAddOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await createOrder(form);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Order added');
    setAddOpen(false);
  }

  async function handleAction(id: string, action: (id: string) => Promise<{ error?: string }>, successMsg: string) {
    setBusyId(id);
    const result = await action(id);
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(successMsg);
  }

  if (parties.length === 0 || sareeTypes.length === 0) {
    return (
      <p className="text-sm text-ink/60">
        You need at least one active Sales/Both Party and one Saree Type before adding an order. Set these up under
        Parties and Settings first.
      </p>
    );
  }

  return (
    <div>
      <div className="flex justify-end">
        <PrimaryButton onClick={openAdd} className="flex items-center gap-1.5">
          <Plus size={16} /> Add order
        </PrimaryButton>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Order #</th>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">Saree type</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Due date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">{o.orderNumber}</td>
                <td className="px-4 py-3 text-ink/70">{o.partyName}</td>
                <td className="px-4 py-3 text-ink/70">{o.sareeTypeName}</td>
                <td className="px-4 py-3 text-ink/70">{o.quantity}</td>
                <td className="px-4 py-3 text-ink/70">₹{o.totalAmount}</td>
                <td className="px-4 py-3 text-ink/70">
                  {o.dueDate ? new Date(o.dueDate).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[o.status]}`}>
                    {STATUS_LABELS[o.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {o.status === 'ORDER_PLACED' && (
                    <button
                      onClick={() => handleAction(o.id, markWarpDyeing, 'Moved to warp dyeing')}
                      disabled={busyId === o.id}
                      className="text-brand-700 hover:underline disabled:opacity-50"
                    >
                      Start warp dyeing
                    </button>
                  )}
                  {o.status === 'WARP_DYEING' && (
                    <button
                      onClick={() => handleAction(o.id, markWeaving, 'Moved to weaving')}
                      disabled={busyId === o.id}
                      className="text-brand-700 hover:underline disabled:opacity-50"
                    >
                      Start weaving
                    </button>
                  )}
                  {o.status === 'WEAVING' && (
                    <button
                      onClick={() => handleAction(o.id, markReady, 'Marked ready')}
                      disabled={busyId === o.id}
                      className="text-brand-700 hover:underline disabled:opacity-50"
                    >
                      Mark ready
                    </button>
                  )}
                  {o.status === 'READY' && (
                    <button
                      onClick={() => handleAction(o.id, markDelivered, 'Marked delivered')}
                      disabled={busyId === o.id}
                      className="text-brand-700 hover:underline disabled:opacity-50"
                    >
                      Mark delivered
                    </button>
                  )}
                  {['ORDER_PLACED', 'WARP_DYEING', 'WEAVING', 'READY'].includes(o.status) && (
                    <button
                      onClick={() => handleAction(o.id, cancelOrder, 'Order cancelled')}
                      disabled={busyId === o.id}
                      className="ml-3 text-ink/40 hover:underline disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                  {(o.status === 'DELIVERED' || o.status === 'CANCELLED') && (
                    <span className="text-ink/30">—</span>
                  )}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink/40">
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add order">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Party (customer)">
            <Select value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })} required>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {selectedParty && (selectedParty.mobile || selectedParty.address) && (
            <p className="rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-2 text-xs text-ink/60">
              {selectedParty.mobile && <>{selectedParty.mobile}</>}
              {selectedParty.mobile && selectedParty.address && ' — '}
              {selectedParty.address}
            </p>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Field label="Saree type">
              <Select value={form.sareeTypeId} onChange={(e) => setForm({ ...form, sareeTypeId: e.target.value })} required>
                {sareeTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity">
              <TextInput
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                required
              />
            </Field>
            <Field label="Price per saree">
              <TextInput
                type="number"
                min={0}
                step="0.01"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                required
              />
            </Field>
          </div>
          <p className="text-xs text-ink/50">Total: ₹{total.toFixed(2)}</p>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Warp colour">
              <TextInput value={form.warpColour} onChange={(e) => setForm({ ...form, warpColour: e.target.value })} />
            </Field>
            <Field label="Weft colour">
              <TextInput value={form.weftColour} onChange={(e) => setForm({ ...form, weftColour: e.target.value })} />
            </Field>
            <Field label="Jari colour">
              <TextInput value={form.jariColour} onChange={(e) => setForm({ ...form, jariColour: e.target.value })} />
            </Field>
          </div>

          <Field label="Description">
            <TextArea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>

          <Field label="Due date (optional)">
            <TextInput type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>

          <Field label="Notes">
            <TextArea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setAddOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Add order'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

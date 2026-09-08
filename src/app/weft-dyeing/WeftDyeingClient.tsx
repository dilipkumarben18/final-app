'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Field, TextInput, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { sendWeftForDyeing, receiveDyedWeft } from '@/lib/actions/weftDyeing';

type Pending = { id: string; colourName: string; sentWeightKg: string; sentDate: string };
type Received = {
  id: string;
  colourName: string;
  sentWeightKg: string;
  receivedWeightKg: string;
  receivedDate: string;
};

export function WeftDyeingClient({
  colourOptions,
  pending,
  recentReceived,
}: {
  colourOptions: string[];
  pending: Pending[];
  recentReceived: Received[];
}) {
  const router = useRouter();
  const [colourName, setColourName] = useState('');
  const [sentWeightKg, setSentWeightKg] = useState('');
  const [sending, setSending] = useState(false);

  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receivedWeightKg, setReceivedWeightKg] = useState('');
  const [receiving, setReceiving] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const result = await sendWeftForDyeing({ colourName, sentWeightKg });
    setSending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Sent for dyeing');
    setColourName('');
    setSentWeightKg('');
    router.refresh();
  }

  async function handleReceive(e: React.FormEvent) {
    e.preventDefault();
    if (!receivingId) return;
    setReceiving(true);
    const result = await receiveDyedWeft({ id: receivingId, receivedWeightKg });
    setReceiving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Received');
    setReceivingId(null);
    setReceivedWeightKg('');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-brand-100 bg-white p-4">
        <h2 className="font-display text-base font-semibold text-ink">Send for dyeing</h2>
        <form onSubmit={handleSend} className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="Colour">
            <TextInput
              list="weft-dyeing-colours"
              value={colourName}
              onChange={(e) => setColourName(e.target.value)}
              placeholder="e.g. Red, Gold…"
              required
            />
            <datalist id="weft-dyeing-colours">
              {colourOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Weight (kg)">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={sentWeightKg}
              onChange={(e) => setSentWeightKg(e.target.value)}
              required
            />
          </Field>
          <PrimaryButton type="submit" disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </PrimaryButton>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <div className="border-b border-brand-50 p-4">
          <h2 className="font-display text-base font-semibold text-ink">Pending at dyeing</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Colour</th>
              <th className="px-4 py-3">Sent weight</th>
              <th className="px-4 py-3">Sent date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {pending.map((p) => (
              <tr key={p.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">{p.colourName}</td>
                <td className="px-4 py-3 text-ink/70">{p.sentWeightKg} kg</td>
                <td className="px-4 py-3 text-ink/70">{new Date(p.sentDate).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  {receivingId === p.id ? (
                    <form onSubmit={handleReceive} className="flex items-center justify-end gap-2">
                      <TextInput
                        type="number"
                        step="0.01"
                        min="0"
                        value={receivedWeightKg}
                        onChange={(e) => setReceivedWeightKg(e.target.value)}
                        placeholder="Weight after dye (kg)"
                        className="w-40"
                        required
                        autoFocus
                      />
                      <PrimaryButton type="submit" disabled={receiving}>
                        {receiving ? 'Saving…' : 'Confirm'}
                      </PrimaryButton>
                      <SecondaryButton type="button" onClick={() => setReceivingId(null)}>
                        Cancel
                      </SecondaryButton>
                    </form>
                  ) : (
                    <SecondaryButton onClick={() => setReceivingId(p.id)}>Receive</SecondaryButton>
                  )}
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink/40">
                  Nothing sent for dyeing right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <div className="border-b border-brand-50 p-4">
          <h2 className="font-display text-base font-semibold text-ink">Recently received</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Colour</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {recentReceived.map((r) => (
              <tr key={r.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">{r.colourName}</td>
                <td className="px-4 py-3 text-ink/70">{r.sentWeightKg} kg</td>
                <td className="px-4 py-3 text-ink/70">{r.receivedWeightKg} kg</td>
                <td className="px-4 py-3 text-ink/70">{new Date(r.receivedDate).toLocaleDateString()}</td>
              </tr>
            ))}
            {recentReceived.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink/40">
                  Nothing received yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

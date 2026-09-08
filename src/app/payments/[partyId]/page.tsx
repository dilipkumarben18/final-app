import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { PartyLedgerClient, type LedgerEntry } from './PartyLedgerClient';

export default async function PartyLedgerPage({ params }: { params: { partyId: string } }) {
  await requirePermission('payments');

  const party = await prisma.party.findUnique({ where: { id: params.partyId } });
  if (!party) notFound();

  const [purchases, purchaseReturns, sales, salesReturns, payments, dyeingBatches] = await Promise.all([
    prisma.purchase.findMany({ where: { partyId: party.id }, orderBy: { date: 'asc' } }),
    prisma.purchaseReturn.findMany({ where: { partyId: party.id }, orderBy: { date: 'asc' } }),
    prisma.sale.findMany({ where: { partyId: party.id }, orderBy: { date: 'asc' } }),
    prisma.salesReturn.findMany({ where: { partyId: party.id }, orderBy: { date: 'asc' } }),
    prisma.payment.findMany({ where: { partyId: party.id }, orderBy: { date: 'asc' } }),
    prisma.dyeingBatch.findMany({ where: { partyId: party.id, charges: { not: null } }, orderBy: { sentDate: 'asc' } }),
  ]);

  // impact: signed change to "amount this party owes the business" — kept
  // in sync with the same formula used for the summary balance on
  // /payments (page.tsx) and computePartyBalances() (partyBalance.ts).
  // Purchases/PurchaseReturns/Payments-PAID/DyeingBatch charges move the
  // balance down (we owe them less / they owe us more relatively); Sales/
  // SalesReturns/Payments-RECEIVED move it up from the customer side.
  const rawEntries: { date: Date; type: string; label: string; impact: number }[] = [
    ...purchases.map((p) => ({ date: p.date, type: 'Purchase', label: p.purchaseNumber, impact: -Number(p.totalAmount) })),
    ...purchaseReturns.map((r) => ({ date: r.date, type: 'Purchase Return', label: r.reason || '—', impact: Number(r.amount) })),
    ...sales.map((s) => ({ date: s.date, type: 'Sale', label: s.invoiceNumber, impact: Number(s.totalAmount) })),
    ...salesReturns.map((r) => ({ date: r.date, type: 'Sales Return', label: r.reason || '—', impact: -Number(r.amount) })),
    ...payments.map((pay) => ({
      date: pay.date,
      type: pay.direction === 'PAID' ? 'Payment Paid' : 'Payment Received',
      label: pay.reference || pay.method || '—',
      impact: pay.direction === 'PAID' ? Number(pay.amount) : -Number(pay.amount),
    })),
    ...dyeingBatches.map((d) => ({ date: d.sentDate, type: 'Dyeing Charges', label: d.reference, impact: -Number(d.charges) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = Number(party.openingBalance);
  const entries: LedgerEntry[] = rawEntries.map((e) => {
    running += e.impact;
    return { date: e.date.toISOString(), type: e.type, label: e.label, impact: e.impact, balance: running };
  });

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <PartyLedgerClient
          party={{ id: party.id, name: party.name, type: party.type }}
          openingBalance={Number(party.openingBalance)}
          entries={entries}
          currentBalance={running}
        />
      </main>
    </div>
  );
}

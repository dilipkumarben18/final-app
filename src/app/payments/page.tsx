import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { computePartyBalances } from '@/lib/partyBalance';
import { PaymentsClient } from './PaymentsClient';

// Net balance per party, "amount this party owes the business" (positive =
// they owe us, negative = we owe them) — see CLAUDE.md's Payments section
// for the full sign-convention writeup.
export default async function PaymentsPage() {
  await requirePermission('payments');

  const [partyRows, recentPayments] = await Promise.all([
    computePartyBalances({ isActive: true }),
    prisma.payment.findMany({
      take: 50,
      orderBy: { date: 'desc' },
      include: {
        party: { select: { name: true } },
        purchase: { select: { purchaseNumber: true } },
        sale: { select: { invoiceNumber: true } },
      },
    }),
  ]);

  const serializedPayments = recentPayments.map((pay) => ({
    id: pay.id,
    partyName: pay.party.name,
    direction: pay.direction,
    amount: pay.amount.toString(),
    date: pay.date.toISOString(),
    method: pay.method,
    reference: pay.reference,
    purchaseNumber: pay.purchase?.purchaseNumber ?? null,
    saleInvoiceNumber: pay.sale?.invoiceNumber ?? null,
  }));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Payments & Party Ledger</h1>
        <p className="mt-1 text-sm text-ink/60">
          Log payments against purchases and sales, and track the running balance per party.
        </p>

        <div className="mt-6">
          <PaymentsClient parties={partyRows} recentPayments={serializedPayments} />
        </div>
      </main>
    </div>
  );
}

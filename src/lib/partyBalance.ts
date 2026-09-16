import type { Prisma, PartyType } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type PartyBalanceRow = { id: string; name: string; type: PartyType; balance: number };

// Net balance per party ("amount this party owes the business" — positive =
// they owe us, negative = we owe them). See CLAUDE.md's "Payments & Party
// Ledger" section for the full sign-convention writeup. This is the bulk
// groupBy version, shared by /payments and /reports; the per-party
// chronological ledger walk in /payments/[partyId] computes the same
// formula row-by-row and can't share this implementation (it needs a
// running total threaded through ordered rows, not a single aggregate).
export async function computePartyBalances(where?: Prisma.PartyWhereInput): Promise<PartyBalanceRow[]> {
  const [parties, purchaseSums, purchaseReturnSums, saleSums, salesReturnSums, paymentSums, dyeingSums] = await Promise.all([
    prisma.party.findMany({ where, orderBy: { name: 'asc' } }),
    prisma.purchase.groupBy({ by: ['partyId'], _sum: { totalAmount: true } }),
    prisma.purchaseReturn.groupBy({ by: ['partyId'], _sum: { amount: true } }),
    prisma.sale.groupBy({ by: ['partyId'], _sum: { totalAmount: true } }),
    prisma.salesReturn.groupBy({ by: ['partyId'], _sum: { amount: true } }),
    prisma.payment.groupBy({ by: ['partyId', 'direction'], _sum: { amount: true } }),
    // Dyeing charges (v2 gap #6) — money we owe the dyeing house, same
    // balance direction as a Purchase. Only DyeingBatch rows with a party
    // set contribute; existing parties with no dyeing activity are
    // unaffected (groupBy simply has no row for them).
    prisma.dyeingBatch.groupBy({ by: ['partyId'], where: { partyId: { not: null } }, _sum: { charges: true } }),
  ]);

  const purchaseByParty = new Map(purchaseSums.map((s) => [s.partyId, Number(s._sum.totalAmount ?? 0)]));
  const purchaseReturnByParty = new Map(purchaseReturnSums.map((s) => [s.partyId, Number(s._sum.amount ?? 0)]));
  const saleByParty = new Map(saleSums.map((s) => [s.partyId, Number(s._sum.totalAmount ?? 0)]));
  const salesReturnByParty = new Map(salesReturnSums.map((s) => [s.partyId, Number(s._sum.amount ?? 0)]));
  const dyeingByParty = new Map(dyeingSums.map((s) => [s.partyId as string, Number(s._sum.charges ?? 0)]));
  const paidByParty = new Map<string, number>();
  const receivedByParty = new Map<string, number>();
  for (const s of paymentSums) {
    const amt = Number(s._sum.amount ?? 0);
    if (s.direction === 'PAID') paidByParty.set(s.partyId, amt);
    else receivedByParty.set(s.partyId, amt);
  }

  return parties.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    balance:
      Number(p.openingBalance) +
      (saleByParty.get(p.id) ?? 0) -
      (salesReturnByParty.get(p.id) ?? 0) -
      (receivedByParty.get(p.id) ?? 0) -
      (purchaseByParty.get(p.id) ?? 0) +
      (purchaseReturnByParty.get(p.id) ?? 0) +
      (paidByParty.get(p.id) ?? 0) -
      (dyeingByParty.get(p.id) ?? 0),
  }));
}

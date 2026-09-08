import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { toCsv } from '@/lib/csv';

export const runtime = 'nodejs';

// GET /purchases/export?from=YYYY-MM-DD&to=YYYY-MM-DD&firmId=...&partyId=...
// All filters optional — omitting all three exports every purchase.
export async function GET(req: NextRequest) {
  await requirePermission('purchaseEntry');

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const firmId = searchParams.get('firmId') || undefined;
  const partyId = searchParams.get('partyId') || undefined;

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (fromParam) {
    const d = new Date(fromParam);
    d.setHours(0, 0, 0, 0);
    dateFilter.gte = d;
  }
  if (toParam) {
    const d = new Date(toParam);
    d.setHours(23, 59, 59, 999);
    dateFilter.lte = d;
  }

  const purchases = await prisma.purchase.findMany({
    where: {
      ...(fromParam || toParam ? { date: dateFilter } : {}),
      ...(firmId ? { firmId } : {}),
      ...(partyId ? { partyId } : {}),
    },
    orderBy: { date: 'asc' },
    include: {
      firm: true,
      party: true,
      items: { include: { rawMaterial: true, sareeType: true } },
      returns: true,
      payments: true,
    },
  });

  const headers = [
    'Purchase No.',
    'Invoice No.',
    'Date',
    'Firm',
    'Party',
    'Party GSTIN',
    'Items',
    'GST Amount',
    'Total Amount',
    'Returned Amount',
    'Paid',
    'Balance',
    'E-way Bill No.',
    'LR No.',
  ];

  const rows = purchases.map((p) => {
    const returnedAmount = p.returns.reduce((sum, r) => sum + Number(r.amount), 0);
    const paid = p.payments.reduce((sum, pay) => sum + Number(pay.amount), 0);
    const balance = Number(p.totalAmount) - returnedAmount - paid;
    const items = p.items.map((it) => `${it.rawMaterial?.name ?? it.sareeType?.name ?? 'Unknown'} (${it.quantity})`).join('; ');

    return [
      p.purchaseNumber,
      p.invoiceNumber || '',
      p.date.toISOString().slice(0, 10),
      p.firm.name,
      p.party.name,
      p.party.gstNumber || '',
      items,
      p.gstAmount.toString(),
      p.totalAmount.toString(),
      returnedAmount.toFixed(2),
      paid.toFixed(2),
      balance.toFixed(2),
      p.ewayBillNumber || '',
      p.lrNumber || '',
    ];
  });

  const csv = toCsv(headers, rows);
  const filename = `purchases-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

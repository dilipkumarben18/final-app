import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { toCsv } from '@/lib/csv';

export const runtime = 'nodejs';

// GET /sales/export?from=YYYY-MM-DD&to=YYYY-MM-DD&firmId=...&partyId=...
export async function GET(req: NextRequest) {
  await requirePermission('salesEntry');

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

  const sales = await prisma.sale.findMany({
    where: {
      ...(fromParam || toParam ? { date: dateFilter } : {}),
      ...(firmId ? { firmId } : {}),
      ...(partyId ? { partyId } : {}),
    },
    orderBy: { date: 'asc' },
    include: {
      firm: true,
      party: true,
      items: { include: { sareeType: true } },
      returns: true,
      payments: true,
    },
  });

  const headers = [
    'Sale No.',
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
    'Opening Entry',
    'E-way Bill No.',
  ];

  const rows = sales.map((s) => {
    const returnedAmount = s.returns.reduce((sum, r) => sum + Number(r.amount), 0);
    const paid = s.payments.reduce((sum, pay) => sum + Number(pay.amount), 0);
    const balance = Number(s.totalAmount) - returnedAmount - paid;
    const items = s.items.map((it) => `${it.sareeType.name} (${it.quantity})`).join('; ');

    return [
      s.saleNumber,
      s.invoiceNumber,
      s.date.toISOString().slice(0, 10),
      s.firm.name,
      s.party.name,
      s.party.gstNumber || '',
      items,
      s.gstAmount.toString(),
      s.totalAmount.toString(),
      returnedAmount.toFixed(2),
      paid.toFixed(2),
      balance.toFixed(2),
      s.isOpeningEntry ? 'Yes' : 'No',
      s.ewayBillNumber || '',
    ];
  });

  const csv = toCsv(headers, rows);
  const filename = `sales-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

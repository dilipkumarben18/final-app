import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { OrdersClient } from './OrdersClient';

export default async function OrdersPage() {
  await requirePermission('orders');

  const [orders, parties, sareeTypes] = await Promise.all([
    prisma.order.findMany({
      include: { party: true, sareeType: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.party.findMany({
      where: { isActive: true, type: { in: ['SALES', 'BOTH'] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, mobile: true, address: true },
    }),
    prisma.sareeType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  const serialized = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    partyName: o.party.name,
    partyMobile: o.party.mobile,
    sareeTypeName: o.sareeType.name,
    quantity: o.quantity,
    rate: o.rate.toString(),
    totalAmount: o.totalAmount.toString(),
    warpColour: o.warpColour,
    weftColour: o.weftColour,
    jariColour: o.jariColour,
    description: o.description,
    dueDate: o.dueDate ? o.dueDate.toISOString() : null,
    notes: o.notes,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
  }));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Orders</h1>
        <p className="mt-1 text-sm text-ink/60">
          Track a customer order from intake through production to delivery.
        </p>

        <div className="mt-6">
          <OrdersClient orders={serialized} parties={parties} sareeTypes={sareeTypes} />
        </div>
      </main>
    </div>
  );
}

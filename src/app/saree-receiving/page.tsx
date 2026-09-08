import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { SareeReceivingClient } from './SareeReceivingClient';

export default async function SareeReceivingPage() {
  await requirePermission('sareeReceiving');

  const assignments = await prisma.warpAssignment.findMany({
    where: { status: 'STARTED' },
    include: {
      weaver: { include: { assignedLocation: true } },
      sareeType: true,
      receivingEntries: true,
      nextAssignment: { select: { status: true } },
    },
    orderBy: { warpStartDate: 'asc' },
  });

  const rows = assignments.map((a) => {
    const receivedNumbers = a.receivingEntries.map((e) => e.sareeNumber);
    return {
      id: a.id,
      weaverId: a.weaverId,
      weaverName: a.weaver.name,
      sareeTypeId: a.sareeTypeId,
      sareeTypeName: a.sareeType.name,
      locationId: a.weaver.assignedLocationId,
      godownName: a.weaver.assignedLocation.name,
      receivedNumbers,
      twentyFourthWoven: !!a.twentyFourthWovenAt,
      canCutTwentyFourth: !!a.twentyFourthWovenAt && a.nextAssignment?.status === 'STARTED',
    };
  });

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Saree Receiving</h1>
        <p className="mt-1 text-sm text-ink/60">
          Tick off each saree as it's physically received. Saree 24 is handled separately once the new warp starts.
        </p>

        <div className="mt-6">
          <SareeReceivingClient rows={rows} />
        </div>
      </main>
    </div>
  );
}

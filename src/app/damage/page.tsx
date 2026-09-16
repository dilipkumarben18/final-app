import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { DamageClient } from './DamageClient';

export default async function DamagePage() {
  await requirePermission('damageEntry');

  const [entries, sareeTypes, locations, weavers] = await Promise.all([
    prisma.damageRegister.findMany({
      include: { sareeType: true, location: true, weaver: true, sareeReceivingEntry: { select: { serialNumber: true } } },
      orderBy: { damageDate: 'desc' },
    }),
    prisma.sareeType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.stockLocation.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.weaverProfile.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  const serialized = entries.map((e) => ({
    id: e.id,
    damageNumber: e.damageNumber,
    serialNumber: e.sareeReceivingEntry?.serialNumber ?? null,
    sareeTypeName: e.sareeType.name,
    locationName: e.location.name,
    weaverName: e.weaver?.name ?? null,
    damageType: e.damageType,
    description: e.description,
    status: e.status,
    damageDate: e.damageDate.toISOString(),
    repairable: e.repairable,
    repairer: e.repairer,
    repairAmount: e.repairAmount ? e.repairAmount.toString() : null,
    sentOutDate: e.sentOutDate ? e.sentOutDate.toISOString() : null,
    repairedDate: e.repairedDate ? e.repairedDate.toISOString() : null,
    photoUrls: e.photoUrls,
  }));

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Damage & Repair Register</h1>
        <p className="mt-1 text-sm text-ink/60">
          Track a damaged saree from discovery through repair and back to sellable stock.
        </p>

        <div className="mt-6">
          <DamageClient entries={serialized} sareeTypes={sareeTypes} locations={locations} weavers={weavers} />
        </div>
      </main>
    </div>
  );
}

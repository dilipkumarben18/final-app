import { prisma } from '@/lib/prisma';
import { RawMaterialsClient } from './RawMaterialsClient';

export default async function RawMaterialsPage() {
  const rawMaterials = await prisma.rawMaterial.findMany({ orderBy: { name: 'asc' } });
  const serialized = rawMaterials.map((rm) => ({
    ...rm,
    currentStock: rm.currentStock.toString(),
    lowStockLevel: rm.lowStockLevel ? rm.lowStockLevel.toString() : null,
  }));
  return <RawMaterialsClient rawMaterials={serialized} />;
}

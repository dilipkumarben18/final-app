import { prisma } from '@/lib/prisma';
import { LocationsClient } from './LocationsClient';

export default async function LocationsPage() {
  const locations = await prisma.stockLocation.findMany({ orderBy: { name: 'asc' } });
  return <LocationsClient locations={locations} />;
}

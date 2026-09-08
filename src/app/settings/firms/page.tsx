import { prisma } from '@/lib/prisma';
import { FirmsClient } from './FirmsClient';

export default async function FirmsPage() {
  const firms = await prisma.firm.findMany({ orderBy: { name: 'asc' } });
  return <FirmsClient firms={firms} />;
}

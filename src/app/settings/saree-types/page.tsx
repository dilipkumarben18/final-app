import { prisma } from '@/lib/prisma';
import { SareeTypesClient } from './SareeTypesClient';

export default async function SareeTypesPage() {
  const sareeTypes = await prisma.sareeType.findMany({ orderBy: { name: 'asc' } });
  const serialized = sareeTypes.map((st) => ({
    ...st,
    jariPerSaree: st.jariPerSaree.toString(),
    weftGramsPerSaree: st.weftGramsPerSaree.toString(),
    costPrice: st.costPrice ? st.costPrice.toString() : null,
  }));
  return <SareeTypesClient sareeTypes={serialized} />;
}

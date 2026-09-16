import { prisma } from '@/lib/prisma';
import { CodeNameMasterClient } from '@/components/CodeNameMasterClient';
import { createJariCode, updateJariCode, setJariCodeActive } from '@/lib/actions/codeNameMasters';

export default async function JariCodesPage() {
  const rows = await prisma.jariCodeMaster.findMany({ orderBy: { code: 'asc' } });
  return (
    <CodeNameMasterClient
      rows={rows}
      addLabel="Add Jari code"
      codeLabel="Code (e.g. C/S)"
      nameLabel="Name (e.g. Copper / Silver)"
      createAction={createJariCode}
      updateAction={updateJariCode}
      toggleAction={setJariCodeActive}
    />
  );
}

import { prisma } from '@/lib/prisma';
import { CodeNameMasterClient } from '@/components/CodeNameMasterClient';
import { createSareeColour, updateSareeColour, setSareeColourActive } from '@/lib/actions/codeNameMasters';

export default async function SareeColoursPage() {
  const rows = await prisma.sareeColourMaster.findMany({ orderBy: { code: 'asc' } });
  return (
    <CodeNameMasterClient
      rows={rows}
      addLabel="Add saree colour"
      codeLabel="Colour code (e.g. M101)"
      nameLabel="Colour name (e.g. Green)"
      createAction={createSareeColour}
      updateAction={updateSareeColour}
      toggleAction={setSareeColourActive}
    />
  );
}

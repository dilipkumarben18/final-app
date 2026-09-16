import { PrismaClient, LocationKind, RawMaterialCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // --- Stock locations -------------------------------------------------
  const locationNames: { name: string; kind: LocationKind }[] = [
    { name: 'Factory / Godown 1', kind: 'GODOWN' },
    { name: 'Factory / Godown 2', kind: 'GODOWN' },
    { name: 'Factory / Godown 3', kind: 'GODOWN' },
    { name: 'Factory / Godown 4', kind: 'GODOWN' },
    { name: 'Home / Ready-to-Sale Stock', kind: 'HOME' },
  ];
  for (const loc of locationNames) {
    await prisma.stockLocation.upsert({
      where: { name: loc.name },
      update: {},
      create: loc,
    });
  }

  // --- Saree types -------------------------------------------------------
  const sareeTypes: {
    name: string;
    alternateNames: string[];
    jariPerSaree: number;
    weftGramsPerSaree: number;
  }[] = [
    { name: 'Bodi', alternateNames: ['Brocade', 'Brocket'], jariPerSaree: 1.5, weftGramsPerSaree: 280 },
    { name: 'Border', alternateNames: ['Pate', 'Ketti Border'], jariPerSaree: 1, weftGramsPerSaree: 280 },
    { name: 'Contrast', alternateNames: ['Dual Colour Border'], jariPerSaree: 1.5, weftGramsPerSaree: 280 },
    { name: 'Oosi', alternateNames: ['Vaira Oosi'], jariPerSaree: 1.5, weftGramsPerSaree: 280 },
    { name: 'Tissue', alternateNames: [], jariPerSaree: 1.5, weftGramsPerSaree: 280 },
  ];
  for (const st of sareeTypes) {
    await prisma.sareeType.upsert({ where: { name: st.name }, update: {}, create: st });
  }

  // --- Raw materials -------------------------------------------------------
  // Warp is always Nos, never Kg — see RawMaterialCategory comment in schema.
  const rawMaterials: { name: string; category: RawMaterialCategory; unit: string }[] = [
    { name: 'Silk Warp', category: 'WARP', unit: 'Nos' },
    { name: 'Weft', category: 'WEFT', unit: 'Kg' },
    { name: 'Jari', category: 'JARI', unit: 'Nos' },
  ];
  for (const rm of rawMaterials) {
    await prisma.rawMaterial.upsert({ where: { name: rm.name }, update: {}, create: rm });
  }

  // --- Firms (placeholders - rename via Settings) -------------------------------------------------------
  const firmNames = ['Firm 1', 'Firm 2', 'Firm 3'];
  for (const name of firmNames) {
    await prisma.firm.upsert({ where: { name }, update: {}, create: { name } });
  }

  // --- Default Master login -------------------------------------------------------
  const masterMobile = '9999999999';
  const existing = await prisma.user.findUnique({ where: { mobile: masterMobile } });
  if (!existing) {
    const passwordHash = await bcrypt.hash('changeme123', 10);
    await prisma.user.create({
      data: {
        name: 'Master Admin',
        mobile: masterMobile,
        passwordHash,
        role: 'MASTER',
        isActive: true,
      },
    });
    console.log(`Created Master login -> mobile: ${masterMobile}, password: changeme123`);
    console.log('Change this password after first login.');
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

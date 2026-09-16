'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireMasterForAction } from '@/lib/session';

const rawMaterialSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.enum(['WARP', 'WEFT', 'JARI', 'DYE', 'ELECTRONICS', 'OTHER']),
  unit: z.string().min(1, 'Unit is required'),
  hsnCode: z.string().optional(),
  lowStockLevel: z.coerce.number().nonnegative().optional(),
});

export type RawMaterialFormState = { error?: string; id?: string };

// Warp is always Nos, never Kg — enforced here rather than in the schema,
// per CLAUDE.md convention.
function validateUnit(category: string, unit: string) {
  if (category === 'WARP' && unit.trim().toLowerCase() === 'kg') {
    return 'Warp must be tracked in Nos, not Kg.';
  }
  return null;
}

export async function createRawMaterial(input: unknown): Promise<RawMaterialFormState> {
  await requireMasterForAction();
  const parsed = rawMaterialSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  const unitError = validateUnit(data.category, data.unit);
  if (unitError) return { error: unitError };

  const created = await prisma.rawMaterial.create({
    data: {
      name: data.name,
      category: data.category,
      unit: data.unit,
      hsnCode: data.hsnCode || undefined,
      lowStockLevel: data.lowStockLevel,
    },
  });
  revalidatePath('/settings/raw-materials');
  revalidatePath('/stock');
  return { id: created.id };
}

// currentStock is never editable here — it's transaction-driven (purchases,
// issues, adjustments), per CLAUDE.md's data-integrity convention.
export async function updateRawMaterial(id: string, input: unknown): Promise<RawMaterialFormState> {
  await requireMasterForAction();
  const parsed = rawMaterialSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  const unitError = validateUnit(data.category, data.unit);
  if (unitError) return { error: unitError };

  await prisma.rawMaterial.update({
    where: { id },
    data: {
      name: data.name,
      category: data.category,
      unit: data.unit,
      hsnCode: data.hsnCode || null,
      lowStockLevel: data.lowStockLevel,
    },
  });
  revalidatePath('/settings/raw-materials');
  revalidatePath('/stock');
  return { id };
}

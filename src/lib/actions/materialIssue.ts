'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

export type MaterialIssueFormState = { error?: string; id?: string };

const issueSchema = z
  .object({
    weaverId: z.string().min(1, 'Weaver is required'),
    sareeTypeId: z.string().min(1, 'Saree type is required'),
    warpAssignmentId: z.string().optional(),
    sareeCount: z.coerce.number().int().min(0).max(6, 'Issue at most 6 sarees at a time'),
    // Weft is often only reissued for some of the sarees this Jari batch
    // covers (e.g. 6 sarees of Jari, but only 3 need new Weft) — defaults
    // to sareeCount when omitted so existing callers keep working as-is.
    weftSareeCount: z.coerce.number().int().min(0).max(6).optional(),
    // Total Jari issued is always recorded (defaults to SareeType's
    // consumption rule, editable) — separate from which brand(s) it came
    // from, since brand attribution is entirely optional (spec revised:
    // sometimes the brand mix isn't tracked at issue time at all).
    jariQuantity: z.coerce.number().nonnegative('Jari quantity cannot be negative'),
    jari1MaterialId: z.string().optional(),
    jari1Quantity: z.coerce.number().positive().optional(),
    jari2MaterialId: z.string().optional(),
    jari2Quantity: z.coerce.number().positive().optional(),
    // Weft colour: pick an existing one, or type a new colour name that
    // doesn't have a Raw Material row yet — never blocks on Settings
    // having it pre-registered.
    weftMaterialId: z.string().optional(),
    weftColourName: z.string().optional(),
    remarks: z.string().optional(),
  })
  .refine((d) => !d.jari1MaterialId || !d.jari2MaterialId || d.jari1MaterialId !== d.jari2MaterialId, {
    message: 'Jari 1 and Jari 2 must be different brands',
    path: ['jari2MaterialId'],
  })
  .refine((d) => !d.jari1MaterialId || d.jari1Quantity !== undefined, {
    message: 'Enter a quantity for Jari 1',
    path: ['jari1Quantity'],
  })
  .refine((d) => !d.jari2MaterialId || d.jari2Quantity !== undefined, {
    message: 'Enter a quantity for Jari 2',
    path: ['jari2Quantity'],
  })
  .refine((d) => (d.weftSareeCount ?? d.sareeCount) === 0 || !!d.weftMaterialId || !!d.weftColourName?.trim(), {
    message: 'Weft colour is required',
    path: ['weftColourName'],
  })
  .refine((d) => d.sareeCount > 0 || (d.weftSareeCount ?? 0) > 0, {
    message: 'Set at least Jari or Weft above 0 — nothing to issue otherwise',
    path: ['sareeCount'],
  });

// Weft quantity is system-calculated from SareeType's consumption rule.
// Jari's total quantity is also tracked (defaults to the same kind of
// calculation, editable) regardless of brand, but which brand(s) it came
// from — Jari 1 / Jari 2 — is entirely optional; when neither is picked,
// no specific RawMaterial stock is touched for Jari at all, only the
// MaterialIssue record's total.
export async function issueMaterial(input: unknown): Promise<MaterialIssueFormState> {
  const user = await requirePermissionForAction('materialIssue');

  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const issue = await prisma.$transaction(async (tx) => {
      const sareeType = await tx.sareeType.findUniqueOrThrow({ where: { id: data.sareeTypeId } });
      const weftSareeCount = data.weftSareeCount ?? data.sareeCount;
      const weftIssuedGrams = Number(sareeType.weftGramsPerSaree) * weftSareeCount;
      const weftIssuedKg = weftIssuedGrams / 1000;

      let jari1: { id: string; category: string } | null = null;
      let jari2: { id: string; category: string } | null = null;
      if (data.jari1MaterialId) {
        jari1 = await tx.rawMaterial.findUniqueOrThrow({ where: { id: data.jari1MaterialId } });
        if (jari1.category !== 'JARI') throw new Error('Jari 1 must be a Jari-category raw material.');
      }
      if (data.jari2MaterialId) {
        jari2 = await tx.rawMaterial.findUniqueOrThrow({ where: { id: data.jari2MaterialId } });
        if (jari2.category !== 'JARI') throw new Error('Jari 2 must be a Jari-category raw material.');
      }

      let weftMaterial;
      if (data.weftMaterialId) {
        weftMaterial = await tx.rawMaterial.findUniqueOrThrow({ where: { id: data.weftMaterialId } });
        if (weftMaterial.category !== 'WEFT') {
          throw new Error('Selected weft material is not a Weft-category raw material.');
        }
      } else {
        const name = data.weftColourName!.trim();
        weftMaterial = await tx.rawMaterial.findFirst({
          where: { category: 'WEFT', name: { equals: name, mode: 'insensitive' } },
        });
        if (!weftMaterial) {
          weftMaterial = await tx.rawMaterial.create({ data: { name, category: 'WEFT', unit: 'Kg' } });
        }
      }

      const created = await tx.materialIssue.create({
        data: {
          weaverId: data.weaverId,
          sareeTypeId: data.sareeTypeId,
          warpAssignmentId: data.warpAssignmentId || undefined,
          sareeCount: data.sareeCount,
          jariIssued: data.jariQuantity,
          weftSareeCount,
          weftIssuedGrams,
          remarks: data.remarks || undefined,
          issuedById: user.id,
        },
      });

      if (jari1 && data.jari1Quantity) {
        await tx.rawMaterial.update({ where: { id: jari1.id }, data: { currentStock: { decrement: data.jari1Quantity } } });
        await tx.rawMaterialTransaction.create({
          data: { rawMaterialId: jari1.id, type: 'ISSUE_OUT', quantity: -data.jari1Quantity, refType: 'MaterialIssue', refId: created.id },
        });
      }
      if (jari2 && data.jari2Quantity) {
        await tx.rawMaterial.update({ where: { id: jari2.id }, data: { currentStock: { decrement: data.jari2Quantity } } });
        await tx.rawMaterialTransaction.create({
          data: { rawMaterialId: jari2.id, type: 'ISSUE_OUT', quantity: -data.jari2Quantity, refType: 'MaterialIssue', refId: created.id },
        });
      }

      if (weftIssuedKg > 0) {
        await tx.rawMaterial.update({ where: { id: weftMaterial.id }, data: { currentStock: { decrement: weftIssuedKg } } });
        await tx.rawMaterialTransaction.create({
          data: { rawMaterialId: weftMaterial.id, type: 'ISSUE_OUT', quantity: -weftIssuedKg, refType: 'MaterialIssue', refId: created.id },
        });
      }

      await writeAuditLog(tx, user.id, 'CREATE', 'MaterialIssue', created.id, undefined, created);
      return created;
    });

    revalidatePath('/material-issue');
    revalidatePath('/stock');
    revalidatePath('/settings/raw-materials');
    return { id: issue.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not issue material.' };
  }
}

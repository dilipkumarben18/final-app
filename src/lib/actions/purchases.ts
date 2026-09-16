'use server';

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

type TxClient = Prisma.TransactionClient;

async function nextPurchaseNumber(tx: TxClient): Promise<string> {
  const count = await tx.purchase.count();
  return `PUR-${(count + 1).toString().padStart(6, '0')}`;
}

const purchaseItemSchema = z.object({
  rawMaterialId: z.string().min(1, 'Raw material is required'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  rate: z.coerce.number().nonnegative('Rate cannot be negative'),
});

const purchaseSchema = z
  .object({
    purchaseType: z.enum(['WITH_INVOICE', 'WITHOUT_INVOICE']).default('WITH_INVOICE'),
    invoiceNumber: z.string().optional(),
    firmId: z.string().min(1, 'Firm is required'),
    partyId: z.string().min(1, 'Party is required'),
    branchId: z.string().optional(),
    date: z.string().min(1, 'Date is required'),
    gstRatePercent: z.coerce.number().min(0).max(100).default(0),
    lrNumber: z.string().optional(),
    ewayBillNumber: z.string().optional(),
    notes: z.string().optional(),
    items: z.array(purchaseItemSchema).min(1, 'Add at least one line item'),
  })
  .refine((data) => data.purchaseType === 'WITHOUT_INVOICE' || !!data.invoiceNumber?.trim(), {
    message: 'Invoice number is required unless this is a without-invoice purchase',
    path: ['invoiceNumber'],
  });

export type PurchaseFormState = { error?: string; id?: string };

export async function createPurchase(input: unknown): Promise<PurchaseFormState> {
  const user = await requirePermissionForAction('purchaseEntry');

  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const gstAmount = Math.round(subtotal * (data.gstRatePercent / 100) * 100) / 100;
  const totalAmount = Math.round((subtotal + gstAmount) * 100) / 100;

  try {
    const purchase = await prisma.$transaction(async (tx) => {
      const materials = await tx.rawMaterial.findMany({
        where: { id: { in: data.items.map((item) => item.rawMaterialId) } },
      });
      const materialById = new Map(materials.map((m) => [m.id, m]));

      const created = await tx.purchase.create({
        data: {
          purchaseNumber: await nextPurchaseNumber(tx),
          purchaseType: data.purchaseType,
          invoiceNumber: data.purchaseType === 'WITHOUT_INVOICE' ? data.invoiceNumber || undefined : data.invoiceNumber,
          firmId: data.firmId,
          partyId: data.partyId,
          branchId: data.branchId || undefined,
          date: new Date(data.date),
          gstAmount,
          totalAmount,
          lrNumber: data.lrNumber || undefined,
          ewayBillNumber: data.ewayBillNumber || undefined,
          notes: data.notes || undefined,
          createdById: user.id,
        },
      });

      // Jari brand isn't known at receiving time (boxes get mixed/checked
      // later) — a JARI-category line item doesn't touch RawMaterial stock
      // here at all. It becomes an UNASSIGNED JariLot instead; stock only
      // moves once the Master names the brand on /jari-lots (assignJariBrand).
      for (const item of data.items) {
        const purchaseItem = await tx.purchaseItem.create({
          data: {
            purchaseId: created.id,
            rawMaterialId: item.rawMaterialId,
            quantity: item.quantity,
            rate: item.rate,
            amount: Math.round(item.quantity * item.rate * 100) / 100,
          },
        });

        const material = materialById.get(item.rawMaterialId);
        if (material?.category === 'JARI') {
          await tx.jariLot.create({
            data: {
              purchaseId: created.id,
              purchaseItemId: purchaseItem.id,
              partyId: data.partyId,
              sourceMaterialName: material.name,
              quantity: item.quantity,
              unit: material.unit,
              receivedDate: new Date(data.date),
            },
          });
        } else if (material?.category === 'ELECTRONICS') {
          // Electronics/machinery purchases (looms, jacquards, switches,
          // motors...) are recorded for the party ledger and GST only —
          // they aren't a consumable production input, so no stock
          // quantity or RawMaterialTransaction is created for them at all.
        } else {
          await tx.rawMaterial.update({
            where: { id: item.rawMaterialId },
            data: { currentStock: { increment: item.quantity } },
          });
          await tx.rawMaterialTransaction.create({
            data: {
              rawMaterialId: item.rawMaterialId,
              type: 'PURCHASE_IN',
              quantity: item.quantity,
              refType: 'Purchase',
              refId: created.id,
            },
          });
        }
      }

      await writeAuditLog(tx, user.id, 'CREATE', 'Purchase', created.id, undefined, created);
      return created;
    });

    revalidatePath('/purchases');
    revalidatePath('/stock');
    revalidatePath('/jari-lots');
    return { id: purchase.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'This invoice number has already been recorded for a purchase.' };
    }
    return { error: 'Could not save purchase. Please try again.' };
  }
}

// ----------------------------------------------------------------------------
// BULK IMPORT — CSV-driven purchase-bill import (see /purchases/bulk-import).
// Always creates isOpeningEntry purchases: this is for bringing in *history*
// (old bills from a bulk-print PDF, another system, etc.), so it deliberately
// never touches RawMaterial.currentStock, RawMaterialTransaction, or
// JariLot — those only make sense for live/current-day receiving. Parties
// and raw materials/saree types referenced by the CSV are matched by
// GSTIN/name and created on the fly if not found; the classification
// (raw material vs. finished saree, and which RawMaterialCategory) is
// supplied by the caller from the review step, not guessed here.
// ----------------------------------------------------------------------------

const bulkPurchaseItemSchema = z.object({
  name: z.string().min(1),
  hsn: z.string().optional(),
  quantity: z.coerce.number().positive(),
  unit: z.string().optional(),
  rate: z.coerce.number().nonnegative(),
  // Resolved by the classification step in the client, one decision per
  // unique item name across the whole import batch.
  kind: z.enum(['RAW_MATERIAL', 'SAREE_TYPE']),
  category: z.enum(['WARP', 'WEFT', 'JARI', 'DYE', 'ELECTRONICS', 'OTHER']).optional(),
  existingId: z.string().optional(),
});

const bulkPurchaseBillSchema = z.object({
  billNumber: z.string().min(1),
  invoiceNumber: z.string().optional(),
  date: z.string().min(1),
  gstAmount: z.coerce.number().nonnegative().default(0),
  totalAmount: z.coerce.number().nonnegative(),
  party: z.object({
    name: z.string().min(1),
    gstNumber: z.string().optional(),
    address: z.string().optional(),
    mobile: z.string().optional(),
  }),
  items: z.array(bulkPurchaseItemSchema).min(1),
});

const bulkImportPurchasesSchema = z.object({
  firmId: z.string().min(1),
  bills: z.array(bulkPurchaseBillSchema).min(1).max(1000),
});

export type BulkImportBillResult =
  | { status: 'created'; billNumber: string; id: string }
  | { status: 'skipped'; billNumber: string; reason: string }
  | { status: 'error'; billNumber: string; reason: string };

export type BulkImportPurchasesResult = { results: BulkImportBillResult[]; error?: string };

export async function bulkImportPurchases(input: unknown): Promise<BulkImportPurchasesResult> {
  const user = await requirePermissionForAction('purchaseEntry');

  const parsed = bulkImportPurchasesSchema.safeParse(input);
  if (!parsed.success) return { results: [], error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  const results: BulkImportBillResult[] = [];

  await prisma.$transaction(async (tx) => {
    // Resolve/create every distinct raw material and saree type referenced,
    // once, before touching any bill — cheaper than a lookup per line item
    // and keeps "same item name -> same master row" consistent across bills.
    const materialCache = new Map<string, string>(); // key: kind+name -> id
    async function resolveItemId(item: z.infer<typeof bulkPurchaseItemSchema>): Promise<string> {
      const cacheKey = `${item.kind}:${item.existingId ?? item.name.trim().toLowerCase()}`;
      const cached = materialCache.get(cacheKey);
      if (cached) return cached;

      if (item.kind === 'RAW_MATERIAL') {
        if (item.existingId) {
          materialCache.set(cacheKey, item.existingId);
          return item.existingId;
        }
        const existing = await tx.rawMaterial.findFirst({
          where: { name: { equals: item.name, mode: 'insensitive' } },
        });
        if (existing) {
          materialCache.set(cacheKey, existing.id);
          return existing.id;
        }
        const created = await tx.rawMaterial.create({
          data: {
            name: item.name,
            category: item.category || 'OTHER',
            unit: item.unit || 'Nos',
            hsnCode: item.hsn || undefined,
          },
        });
        materialCache.set(cacheKey, created.id);
        return created.id;
      } else {
        if (item.existingId) {
          materialCache.set(cacheKey, item.existingId);
          return item.existingId;
        }
        const existing = await tx.sareeType.findFirst({
          where: { name: { equals: item.name, mode: 'insensitive' } },
        });
        if (existing) {
          materialCache.set(cacheKey, existing.id);
          return existing.id;
        }
        const created = await tx.sareeType.create({
          data: {
            name: item.name,
            hsnCode: item.hsn || undefined,
            jariPerSaree: 0,
          },
        });
        materialCache.set(cacheKey, created.id);
        return created.id;
      }
    }

    for (const bill of data.bills) {
      try {
        // Match/create the party — same GSTIN-first, name-fallback dedupe
        // as bulkImportParties, kept inline since it also needs to happen
        // inside this same transaction per-bill.
        let party = bill.party.gstNumber
          ? await tx.party.findFirst({ where: { gstNumber: bill.party.gstNumber } })
          : await tx.party.findFirst({ where: { name: { equals: bill.party.name, mode: 'insensitive' } } });

        if (!party) {
          party = await tx.party.create({
            data: {
              name: bill.party.name,
              type: 'PURCHASE',
              gstNumber: bill.party.gstNumber || undefined,
              address: bill.party.address || undefined,
              mobile: bill.party.mobile || undefined,
            },
          });
        }

        const existingPurchase = bill.invoiceNumber
          ? await tx.purchase.findFirst({ where: { invoiceNumber: bill.invoiceNumber } })
          : null;
        if (existingPurchase) {
          results.push({ status: 'skipped', billNumber: bill.billNumber, reason: 'Invoice number already imported' });
          continue;
        }

        const purchase = await tx.purchase.create({
          data: {
            purchaseNumber: await nextPurchaseNumber(tx),
            purchaseType: bill.invoiceNumber ? 'WITH_INVOICE' : 'WITHOUT_INVOICE',
            invoiceNumber: bill.invoiceNumber || undefined,
            firmId: data.firmId,
            partyId: party.id,
            date: new Date(bill.date),
            gstAmount: bill.gstAmount,
            totalAmount: bill.totalAmount,
            isOpeningEntry: true,
            createdById: user.id,
          },
        });

        for (const item of bill.items) {
          const resolvedId = await resolveItemId(item);
          await tx.purchaseItem.create({
            data: {
              purchaseId: purchase.id,
              rawMaterialId: item.kind === 'RAW_MATERIAL' ? resolvedId : undefined,
              sareeTypeId: item.kind === 'SAREE_TYPE' ? resolvedId : undefined,
              quantity: item.quantity,
              rate: item.rate,
              amount: Math.round(item.quantity * item.rate * 100) / 100,
            },
          });
        }

        await writeAuditLog(tx, user.id, 'CREATE', 'Purchase', purchase.id, undefined, purchase);
        results.push({ status: 'created', billNumber: bill.billNumber, id: purchase.id });
      } catch (e) {
        results.push({
          status: 'error',
          billNumber: bill.billNumber,
          reason: e instanceof Error ? e.message : 'Could not save',
        });
      }
    }
  });

  revalidatePath('/purchases');
  return { results };
}

const purchaseReturnItemSchema = z.object({
  rawMaterialId: z.string().min(1, 'Raw material is required'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
});

const purchaseReturnSchema = z.object({
  purchaseId: z.string().min(1),
  partyId: z.string().min(1),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  reason: z.string().optional(),
  items: z.array(purchaseReturnItemSchema).min(1, 'Add at least one returned material'),
});

export async function createPurchaseReturn(input: unknown): Promise<PurchaseFormState> {
  const user = await requirePermissionForAction('purchaseEntry');

  const parsed = purchaseReturnSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  try {
    const purchaseReturn = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseReturn.create({
        data: {
          purchaseId: data.purchaseId,
          partyId: data.partyId,
          amount: data.amount,
          reason: data.reason || undefined,
          items: {
            create: data.items.map((item) => ({
              rawMaterialId: item.rawMaterialId,
              quantity: item.quantity,
            })),
          },
        },
        include: { items: true },
      });

      for (const item of data.items) {
        await tx.rawMaterial.update({
          where: { id: item.rawMaterialId },
          data: { currentStock: { decrement: item.quantity } },
        });
        await tx.rawMaterialTransaction.create({
          data: {
            rawMaterialId: item.rawMaterialId,
            type: 'ADJUSTMENT',
            quantity: -item.quantity,
            refType: 'PurchaseReturn',
            refId: created.id,
          },
        });
      }

      await writeAuditLog(tx, user.id, 'RETURN', 'PurchaseReturn', created.id, undefined, created);
      return created;
    });

    revalidatePath('/purchases');
    revalidatePath('/stock');
    return { id: purchaseReturn.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save return. Please try again.' };
  }
}

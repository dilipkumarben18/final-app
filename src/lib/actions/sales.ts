'use server';

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermissionForAction } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

type TxClient = Prisma.TransactionClient;

async function nextSaleNumber(tx: TxClient): Promise<string> {
  const count = await tx.sale.count();
  return `SAL-${(count + 1).toString().padStart(6, '0')}`;
}

async function nextDamageNumber(tx: TxClient): Promise<string> {
  const count = await tx.damageRegister.count();
  return `DMG-${(count + 1).toString().padStart(6, '0')}`;
}

const saleItemSchema = z.object({
  sareeTypeId: z.string().min(1, 'Saree type is required'),
  quantity: z.coerce.number().int().positive('Quantity must be greater than 0'),
  rate: z.coerce.number().nonnegative('Rate cannot be negative'),
});

const saleSchema = z
  .object({
    invoiceNumber: z.string().min(1, 'Invoice number is required'),
    firmId: z.string().min(1, 'Firm is required'),
    partyId: z.string().min(1, 'Party is required'),
    branchId: z.string().optional(),
    isOpeningEntry: z.boolean().default(false),
    locationId: z.string().optional(),
    date: z.string().min(1, 'Date is required'),
    gstRatePercent: z.coerce.number().min(0).max(100).default(0),
    dueDate: z.string().optional(),
    ewayBillNumber: z.string().optional(),
    courierLrNumber: z.string().optional(),
    courierCharges: z.coerce.number().nonnegative().optional(),
    freightStatus: z.enum(['PAID', 'TO_PAY']).optional(),
    notes: z.string().optional(),
    items: z.array(saleItemSchema).min(1, 'Add at least one line item'),
  })
  .refine((d) => d.isOpeningEntry || !!d.locationId, {
    message: 'Home stock location is required',
    path: ['locationId'],
  });

export type SaleFormState = { error?: string; id?: string };

export async function createSale(input: unknown): Promise<SaleFormState> {
  const user = await requirePermissionForAction('salesEntry');

  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const gstAmount = Math.round(subtotal * (data.gstRatePercent / 100) * 100) / 100;
  const totalAmount = Math.round((subtotal + gstAmount) * 100) / 100;

  const neededBySareeType = new Map<string, number>();
  for (const item of data.items) {
    neededBySareeType.set(item.sareeTypeId, (neededBySareeType.get(item.sareeTypeId) ?? 0) + item.quantity);
  }

  try {
    const sale = await prisma.$transaction(async (tx) => {
      // Opening/historical entries record a past bill for party-ledger
      // accuracy only — the goods behind it left stock before this app
      // existed to track it, so stock is neither checked nor touched here.
      if (!data.isOpeningEntry) {
        const location = await tx.stockLocation.findUniqueOrThrow({ where: { id: data.locationId! } });
        if (location.kind !== 'HOME') throw new Error('Sales can only be made from Home stock.');

        for (const [sareeTypeId, quantity] of neededBySareeType) {
          const balance = await tx.finishedStockBalance.findUnique({
            where: {
              locationId_sareeTypeId_state: { locationId: data.locationId!, sareeTypeId, state: 'NORMAL' },
            },
          });
          if (!balance || balance.quantity < quantity) {
            const sareeType = await tx.sareeType.findUnique({ where: { id: sareeTypeId } });
            throw new Error(
              `Not enough stock of ${sareeType?.name ?? 'this saree type'} at ${location.name} (need ${quantity}, have ${balance?.quantity ?? 0}).`
            );
          }
        }
      }

      const created = await tx.sale.create({
        data: {
          saleNumber: await nextSaleNumber(tx),
          invoiceNumber: data.invoiceNumber,
          firmId: data.firmId,
          partyId: data.partyId,
          branchId: data.branchId || undefined,
          isOpeningEntry: data.isOpeningEntry,
          date: new Date(data.date),
          gstAmount,
          totalAmount,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          ewayBillNumber: data.ewayBillNumber || undefined,
          courierLrNumber: data.courierLrNumber || undefined,
          courierCharges: data.courierCharges,
          freightStatus: data.freightStatus,
          notes: data.notes || undefined,
          createdById: user.id,
          items: {
            create: data.items.map((item) => ({
              sareeTypeId: item.sareeTypeId,
              quantity: item.quantity,
              rate: item.rate,
              amount: Math.round(item.quantity * item.rate * 100) / 100,
            })),
          },
        },
        include: { items: true },
      });

      if (!data.isOpeningEntry) {
        for (const [sareeTypeId, quantity] of neededBySareeType) {
          await tx.finishedStockBalance.update({
            where: {
              locationId_sareeTypeId_state: { locationId: data.locationId!, sareeTypeId, state: 'NORMAL' },
            },
            data: { quantity: { decrement: quantity } },
          });
        }
      }

      await writeAuditLog(tx, user.id, 'CREATE', 'Sale', created.id, undefined, created);
      return created;
    });

    revalidatePath('/sales');
    revalidatePath('/stock');
    return { id: sale.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'This invoice number has already been recorded for a sale.' };
    }
    return { error: e instanceof Error ? e.message : 'Could not save sale. Please try again.' };
  }
}

// ----------------------------------------------------------------------------
// BULK IMPORT — CSV-driven sale-bill import (see /sales/bulk-import). Always
// isOpeningEntry: true, so (like bulkImportPurchases) this never touches
// FinishedStockBalance — it's for bringing in accounting/GST history, not
// live stock movements. Saree types are matched by name and created on the
// fly if missing (unlike purchases, there's no raw-material/finished-goods
// ambiguity here — a sale line is always a saree type).
// ----------------------------------------------------------------------------

const bulkSaleItemSchema = z.object({
  sareeTypeName: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  rate: z.coerce.number().nonnegative(),
});

const bulkSaleBillSchema = z.object({
  billNumber: z.string().min(1),
  invoiceNumber: z.string().min(1),
  date: z.string().min(1),
  gstAmount: z.coerce.number().nonnegative().default(0),
  totalAmount: z.coerce.number().nonnegative(),
  party: z.object({
    name: z.string().min(1),
    gstNumber: z.string().optional(),
    address: z.string().optional(),
    mobile: z.string().optional(),
  }),
  items: z.array(bulkSaleItemSchema).min(1),
});

const bulkImportSalesSchema = z.object({
  firmId: z.string().min(1),
  bills: z.array(bulkSaleBillSchema).min(1).max(1000),
});

export type BulkImportSaleResult =
  | { status: 'created'; billNumber: string; id: string }
  | { status: 'skipped'; billNumber: string; reason: string }
  | { status: 'error'; billNumber: string; reason: string };

export type BulkImportSalesResult = { results: BulkImportSaleResult[]; error?: string };

export async function bulkImportSales(input: unknown): Promise<BulkImportSalesResult> {
  const user = await requirePermissionForAction('salesEntry');

  const parsed = bulkImportSalesSchema.safeParse(input);
  if (!parsed.success) return { results: [], error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  const results: BulkImportSaleResult[] = [];

  await prisma.$transaction(async (tx) => {
    const sareeTypeCache = new Map<string, string>();
    async function resolveSareeTypeId(name: string): Promise<string> {
      const key = name.trim().toLowerCase();
      const cached = sareeTypeCache.get(key);
      if (cached) return cached;
      const existing = await tx.sareeType.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      if (existing) {
        sareeTypeCache.set(key, existing.id);
        return existing.id;
      }
      const created = await tx.sareeType.create({ data: { name, jariPerSaree: 0 } });
      sareeTypeCache.set(key, created.id);
      return created.id;
    }

    for (const bill of data.bills) {
      try {
        const existingSale = await tx.sale.findUnique({ where: { invoiceNumber: bill.invoiceNumber } });
        if (existingSale) {
          results.push({ status: 'skipped', billNumber: bill.billNumber, reason: 'Invoice number already imported' });
          continue;
        }

        let party = bill.party.gstNumber
          ? await tx.party.findFirst({ where: { gstNumber: bill.party.gstNumber } })
          : await tx.party.findFirst({ where: { name: { equals: bill.party.name, mode: 'insensitive' } } });

        if (!party) {
          party = await tx.party.create({
            data: {
              name: bill.party.name,
              type: 'SALES',
              gstNumber: bill.party.gstNumber || undefined,
              address: bill.party.address || undefined,
              mobile: bill.party.mobile || undefined,
            },
          });
        }

        const sale = await tx.sale.create({
          data: {
            saleNumber: await nextSaleNumber(tx),
            invoiceNumber: bill.invoiceNumber,
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
          const sareeTypeId = await resolveSareeTypeId(item.sareeTypeName);
          await tx.saleItem.create({
            data: {
              saleId: sale.id,
              sareeTypeId,
              quantity: item.quantity,
              rate: item.rate,
              amount: Math.round(item.quantity * item.rate * 100) / 100,
            },
          });
        }

        await writeAuditLog(tx, user.id, 'CREATE', 'Sale', sale.id, undefined, sale);
        results.push({ status: 'created', billNumber: bill.billNumber, id: sale.id });
      } catch (e) {
        results.push({
          status: 'error',
          billNumber: bill.billNumber,
          reason: e instanceof Error ? e.message : 'Could not save',
        });
      }
    }
  });

  revalidatePath('/sales');
  return { results };
}

const salesReturnItemSchema = z.object({
  saleItemId: z.string().min(1),
  quantity: z.coerce.number().int().positive('Quantity must be greater than 0'),
  condition: z.enum(['GOOD', 'DAMAGED']),
});

const salesReturnSchema = z.object({
  saleId: z.string().min(1),
  partyId: z.string().min(1),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  reason: z.string().optional(),
  locationId: z.string().min(1, 'Location is required'),
  items: z.array(salesReturnItemSchema).min(1, 'Add at least one returned item'),
});

// Returned quantity is capped against what's actually left on the original
// sale (sold minus already returned), and condition decides where the
// saree goes — GOOD back to normal stock, DAMAGED into the Damage register
// (spec section 14).
export async function createSalesReturn(input: unknown): Promise<SaleFormState> {
  const user = await requirePermissionForAction('salesEntry');

  const parsed = salesReturnSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const data = parsed.data;

  // Multiple lines can target the same SaleItem (e.g. some Good, some
  // Damaged) — cap the combined requested quantity per line, not each
  // line in isolation, or two lines could each pass individually while
  // together exceeding what's left.
  const requestedBySaleItemId = new Map<string, number>();
  for (const item of data.items) {
    requestedBySaleItemId.set(item.saleItemId, (requestedBySaleItemId.get(item.saleItemId) ?? 0) + item.quantity);
  }

  try {
    const salesReturn = await prisma.$transaction(async (tx) => {
      for (const [saleItemId, requestedQuantity] of requestedBySaleItemId) {
        const saleItem = await tx.saleItem.findUnique({
          where: { id: saleItemId },
          include: { returnItems: true },
        });
        if (!saleItem || saleItem.saleId !== data.saleId) {
          throw new Error('One of the selected line items does not belong to this sale.');
        }
        const alreadyReturned = saleItem.returnItems.reduce((sum, r) => sum + r.quantity, 0);
        const remaining = saleItem.quantity - alreadyReturned;
        if (requestedQuantity > remaining) {
          throw new Error(`Cannot return ${requestedQuantity} — only ${remaining} left to return on this line.`);
        }
      }

      const created = await tx.salesReturn.create({
        data: {
          saleId: data.saleId,
          partyId: data.partyId,
          amount: data.amount,
          reason: data.reason || undefined,
          items: {
            create: data.items.map((item) => ({
              saleItemId: item.saleItemId,
              quantity: item.quantity,
              condition: item.condition,
            })),
          },
        },
        include: { items: { include: { saleItem: true } } },
      });

      for (const item of created.items) {
        const sareeTypeId = item.saleItem.sareeTypeId;

        if (item.condition === 'GOOD') {
          await tx.finishedStockBalance.upsert({
            where: {
              locationId_sareeTypeId_state: { locationId: data.locationId, sareeTypeId, state: 'NORMAL' },
            },
            create: { locationId: data.locationId, sareeTypeId, state: 'NORMAL', quantity: item.quantity },
            update: { quantity: { increment: item.quantity } },
          });
        } else {
          await tx.finishedStockBalance.upsert({
            where: {
              locationId_sareeTypeId_state: { locationId: data.locationId, sareeTypeId, state: 'DAMAGED' },
            },
            create: { locationId: data.locationId, sareeTypeId, state: 'DAMAGED', quantity: item.quantity },
            update: { quantity: { increment: item.quantity } },
          });

          for (let i = 0; i < item.quantity; i++) {
            await tx.damageRegister.create({
              data: {
                damageNumber: await nextDamageNumber(tx),
                sareeTypeId,
                locationId: data.locationId,
                damageType: 'OTHER',
                description: `Sales return (damaged)${data.reason ? ` — ${data.reason}` : ''}`,
                status: 'DAMAGED',
              },
            });
          }
        }
      }

      await writeAuditLog(tx, user.id, 'RETURN', 'SalesReturn', created.id, undefined, created);
      return created;
    });

    revalidatePath('/sales');
    revalidatePath('/stock');
    revalidatePath('/damage');
    return { id: salesReturn.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save return. Please try again.' };
  }
}

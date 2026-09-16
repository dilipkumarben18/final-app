import { NextRequest, NextResponse } from 'next/server';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { amountInWords, formatNumber, formatCurrency, formatBillDate } from '@/lib/numberToWords';
import { stateFromGstin, computeTaxBreakdown } from '@/lib/gst';

export const runtime = 'nodejs';

const RED = '#8B1E2B';

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: 'Helvetica', color: '#222' },
  titleBar: { backgroundColor: RED, paddingVertical: 6, marginBottom: 10, alignItems: 'center' },
  titleText: { color: '#fff', fontSize: 14, fontFamily: 'Helvetica-Bold' },

  firmBlock: { alignItems: 'flex-end', marginBottom: 10 },
  firmName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: RED, marginBottom: 2 },
  firmLine: { fontSize: 8.5, color: '#444' },

  twoCol: { flexDirection: 'row', marginBottom: 10 },
  colBox: { flex: 1, borderWidth: 1, borderColor: '#ddd' },
  colBoxLeft: { marginRight: 6 },
  colHeader: { backgroundColor: RED, color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 9, padding: 4 },
  colBody: { padding: 6 },
  bodyName: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  bodyLine: { fontSize: 8.5, marginBottom: 2, color: '#444' },

  table: { borderWidth: 1, borderColor: '#ddd', marginBottom: 10 },
  theadRow: { flexDirection: 'row', backgroundColor: RED },
  th: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 8, padding: 4 },
  tr: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#eee' },
  td: { fontSize: 8.5, padding: 4 },
  totalRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#333', backgroundColor: '#f7f7f7' },
  totalTd: { fontSize: 9, padding: 4, fontFamily: 'Helvetica-Bold' },

  colNo: { width: '4%' },
  colItem: { width: '22%' },
  colHsn: { width: '10%' },
  colQty: { width: '9%', textAlign: 'right' },
  colUnit: { width: '8%' },
  colPrice: { width: '12%', textAlign: 'right' },
  colTaxable: { width: '13%', textAlign: 'right' },
  colGst: { width: '11%', textAlign: 'right' },
  colAmount: { width: '11%', textAlign: 'right' },

  taxTable: { borderWidth: 1, borderColor: '#ddd', marginBottom: 10, width: '55%' },
  taxThRow: { flexDirection: 'row', backgroundColor: '#f0f0f0' },
  taxTh: { fontFamily: 'Helvetica-Bold', fontSize: 8, padding: 4, flex: 1 },
  taxTd: { fontSize: 8.5, padding: 4, flex: 1 },

  footerRow: { flexDirection: 'row', marginTop: 16 },
  footerCol: { flex: 1 },
  signBox: { alignItems: 'center', marginTop: 30 },
  signLabel: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginTop: 24 },
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await requirePermission('purchaseEntry');

  const purchase = await prisma.purchase.findUnique({
    where: { id: params.id },
    include: { firm: true, party: true, branch: true, items: { include: { rawMaterial: true, sareeType: true } }, createdBy: true },
  });

  if (!purchase) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const paid = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: { purchaseId: purchase.id, direction: 'PAID' },
  });
  const paidAmount = Number(paid._sum.amount ?? 0);
  const balance = Number(purchase.totalAmount) - paidAmount;

  const subtotal = purchase.items.reduce((sum, item) => sum + Number(item.amount), 0);
  const gstRatePercent = subtotal > 0 ? (Number(purchase.gstAmount) / subtotal) * 100 : 0;
  const tax = computeTaxBreakdown(purchase.firm.gstNumber, purchase.party.gstNumber, subtotal, gstRatePercent);
  const placeOfSupply = stateFromGstin(purchase.firm.gstNumber);

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.titleBar}>
          <Text style={styles.titleText}>Bill</Text>
        </View>

        <View style={styles.firmBlock}>
          <Text style={styles.firmName}>{purchase.firm.name}</Text>
          {purchase.firm.address && <Text style={styles.firmLine}>{purchase.firm.address}</Text>}
          {purchase.firm.contactInfo && <Text style={styles.firmLine}>{purchase.firm.contactInfo}</Text>}
          {purchase.firm.gstNumber && (
            <Text style={styles.firmLine}>
              GSTIN: {purchase.firm.gstNumber}
              {placeOfSupply ? `, State: ${placeOfSupply}` : ''}
            </Text>
          )}
        </View>

        <View style={styles.twoCol}>
          <View style={[styles.colBox, styles.colBoxLeft]}>
            <Text style={styles.colHeader}>Bill From</Text>
            <View style={styles.colBody}>
              <Text style={styles.bodyName}>{purchase.party.name}</Text>
              {purchase.branch && <Text style={styles.bodyLine}>Branch: {purchase.branch.name}</Text>}
              {(purchase.branch?.address || purchase.party.address) && (
                <Text style={styles.bodyLine}>{purchase.branch?.address || purchase.party.address}</Text>
              )}
              {purchase.party.gstNumber && (
                <Text style={styles.bodyLine}>GSTIN: {purchase.party.gstNumber}</Text>
              )}
              {stateFromGstin(purchase.party.gstNumber) && (
                <Text style={styles.bodyLine}>State: {stateFromGstin(purchase.party.gstNumber)}</Text>
              )}
            </View>
          </View>
          <View style={styles.colBox}>
            <Text style={styles.colHeader}>Bill Details</Text>
            <View style={styles.colBody}>
              <Text style={styles.bodyLine}>Bill No.: {purchase.purchaseNumber}</Text>
              <Text style={styles.bodyLine}>
                Invoice #: {purchase.invoiceNumber || 'Without invoice'}
              </Text>
              <Text style={styles.bodyLine}>Date: {formatBillDate(purchase.date)}</Text>
              {placeOfSupply && <Text style={styles.bodyLine}>Place of supply: {placeOfSupply}</Text>}
              {purchase.lrNumber && <Text style={styles.bodyLine}>LR #: {purchase.lrNumber}</Text>}
              {purchase.ewayBillNumber && (
                <Text style={styles.bodyLine}>E-Way Bill #: {purchase.ewayBillNumber}</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.theadRow}>
            <Text style={[styles.th, styles.colNo]}>#</Text>
            <Text style={[styles.th, styles.colItem]}>Item name</Text>
            <Text style={[styles.th, styles.colHsn]}>HSN/SAC</Text>
            <Text style={[styles.th, styles.colQty]}>Quantity</Text>
            <Text style={[styles.th, styles.colUnit]}>Unit</Text>
            <Text style={[styles.th, styles.colPrice]}>Price/Unit</Text>
            <Text style={[styles.th, styles.colTaxable]}>Taxable amt</Text>
            <Text style={[styles.th, styles.colGst]}>GST</Text>
            <Text style={[styles.th, styles.colAmount]}>Amount</Text>
          </View>
          {purchase.items.map((item, i) => {
            const taxableAmount = Number(item.amount);
            const itemGst = Math.round(taxableAmount * (gstRatePercent / 100) * 100) / 100;
            return (
              <View key={item.id} style={styles.tr}>
                <Text style={[styles.td, styles.colNo]}>{i + 1}</Text>
                <Text style={[styles.td, styles.colItem]}>{item.rawMaterial?.name ?? item.sareeType?.name ?? '—'}</Text>
                <Text style={[styles.td, styles.colHsn]}>{item.rawMaterial?.hsnCode || item.sareeType?.hsnCode || '—'}</Text>
                <Text style={[styles.td, styles.colQty]}>{item.quantity.toString()}</Text>
                <Text style={[styles.td, styles.colUnit]}>{item.rawMaterial?.unit ?? 'Nos'}</Text>
                <Text style={[styles.td, styles.colPrice]}>{formatNumber(Number(item.rate))}</Text>
                <Text style={[styles.td, styles.colTaxable]}>{formatNumber(taxableAmount)}</Text>
                <Text style={[styles.td, styles.colGst]}>{formatNumber(itemGst)}</Text>
                <Text style={[styles.td, styles.colAmount]}>{formatNumber(taxableAmount + itemGst)}</Text>
              </View>
            );
          })}
          <View style={styles.totalRow}>
            <Text style={[styles.totalTd, styles.colNo]} />
            <Text style={[styles.totalTd, styles.colItem]}>Total</Text>
            <Text style={[styles.totalTd, styles.colHsn]} />
            <Text style={[styles.totalTd, styles.colQty]}>
              {purchase.items.reduce((sum, it) => sum + Number(it.quantity), 0)}
            </Text>
            <Text style={[styles.totalTd, styles.colUnit]} />
            <Text style={[styles.totalTd, styles.colPrice]} />
            <Text style={[styles.totalTd, styles.colTaxable]}>{formatNumber(subtotal)}</Text>
            <Text style={[styles.totalTd, styles.colGst]}>{formatNumber(Number(purchase.gstAmount))}</Text>
            <Text style={[styles.totalTd, styles.colAmount]}>{formatNumber(Number(purchase.totalAmount))}</Text>
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={[styles.colBox, styles.colBoxLeft]}>
            <Text style={styles.colHeader}>Bill Amount In Words</Text>
            <View style={styles.colBody}>
              <Text style={styles.bodyLine}>{amountInWords(Number(purchase.totalAmount))}</Text>
            </View>
          </View>
          <View style={styles.colBox}>
            <Text style={styles.colHeader}>Amounts</Text>
            <View style={styles.colBody}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.bodyLine}>Sub Total</Text>
                <Text style={styles.bodyLine}>{formatCurrency(subtotal)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[styles.bodyLine, { fontFamily: 'Helvetica-Bold', color: '#222' }]}>Total</Text>
                <Text style={[styles.bodyLine, { fontFamily: 'Helvetica-Bold', color: '#222' }]}>
                  {formatCurrency(Number(purchase.totalAmount))}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.bodyLine}>Paid</Text>
                <Text style={styles.bodyLine}>{formatCurrency(paidAmount)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.bodyLine}>Balance</Text>
                <Text style={styles.bodyLine}>{formatCurrency(balance)}</Text>
              </View>
            </View>
          </View>
        </View>

        {Number(purchase.gstAmount) > 0 && (
          <View style={styles.taxTable}>
            <View style={styles.taxThRow}>
              <Text style={styles.taxTh}>Tax type</Text>
              <Text style={[styles.taxTh, { textAlign: 'right' }]}>Taxable amount</Text>
              <Text style={[styles.taxTh, { textAlign: 'right' }]}>Rate</Text>
              <Text style={[styles.taxTh, { textAlign: 'right' }]}>Tax amount</Text>
            </View>
            {tax.type === 'IGST' ? (
              <View style={{ flexDirection: 'row' }}>
                <Text style={styles.taxTd}>IGST</Text>
                <Text style={[styles.taxTd, { textAlign: 'right' }]}>{formatCurrency(subtotal)}</Text>
                <Text style={[styles.taxTd, { textAlign: 'right' }]}>{tax.rate.toFixed(0)}%</Text>
                <Text style={[styles.taxTd, { textAlign: 'right' }]}>{formatCurrency(tax.igstAmount)}</Text>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row' }}>
                  <Text style={styles.taxTd}>CGST</Text>
                  <Text style={[styles.taxTd, { textAlign: 'right' }]}>{formatCurrency(subtotal)}</Text>
                  <Text style={[styles.taxTd, { textAlign: 'right' }]}>{tax.rate.toFixed(1)}%</Text>
                  <Text style={[styles.taxTd, { textAlign: 'right' }]}>{formatCurrency(tax.cgstAmount)}</Text>
                </View>
                <View style={{ flexDirection: 'row' }}>
                  <Text style={styles.taxTd}>SGST</Text>
                  <Text style={[styles.taxTd, { textAlign: 'right' }]}>{formatCurrency(subtotal)}</Text>
                  <Text style={[styles.taxTd, { textAlign: 'right' }]}>{tax.rate.toFixed(1)}%</Text>
                  <Text style={[styles.taxTd, { textAlign: 'right' }]}>{formatCurrency(tax.sgstAmount)}</Text>
                </View>
              </>
            )}
          </View>
        )}

        {purchase.notes && <Text style={[styles.bodyLine, { marginBottom: 10 }]}>Notes: {purchase.notes}</Text>}

        <View style={styles.footerRow}>
          <View style={styles.footerCol}>
            <Text style={styles.colHeader}>Terms and Conditions</Text>
            <Text style={[styles.bodyLine, { padding: 6 }]}>Thanks for doing business with us!</Text>
          </View>
          <View style={styles.footerCol}>
            <View style={styles.signBox}>
              <Text style={styles.bodyLine}>For : {purchase.firm.name}</Text>
              <Text style={styles.signLabel}>Authorized Signatory</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(doc);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${purchase.invoiceNumber || purchase.purchaseNumber}.pdf"`,
    },
  });
}

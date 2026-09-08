// GST state codes (first 2 digits of a GSTIN) — used to print "State:
// NN-Name" on bills and to decide CGST+SGST vs IGST.
const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli', '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

/** "33-Tamil Nadu" from a GSTIN, or null if missing/unrecognized. */
export function stateFromGstin(gstin?: string | null): string | null {
  if (!gstin || gstin.length < 2) return null;
  const code = gstin.slice(0, 2);
  const name = GST_STATE_CODES[code];
  return name ? `${code}-${name}` : null;
}

export type TaxBreakdown =
  | { type: 'CGST_SGST'; rate: number; cgstAmount: number; sgstAmount: number }
  | { type: 'IGST'; rate: number; igstAmount: number };

/** CGST+SGST (split evenly) when both parties are in the same state,
 * otherwise IGST (full rate) — the standard GST place-of-supply rule.
 * Falls back to IGST when either GSTIN is missing, since that's the more
 * common case for this business's inter-state supplier/customer mix and
 * still produces a sensible printed bill rather than no tax line at all. */
export function computeTaxBreakdown(
  firmGstin: string | null | undefined,
  partyGstin: string | null | undefined,
  taxableAmount: number,
  gstRatePercent: number
): TaxBreakdown {
  const firmState = firmGstin?.slice(0, 2);
  const partyState = partyGstin?.slice(0, 2);
  const sameState = firmState && partyState && firmState === partyState;

  if (sameState) {
    const halfRate = gstRatePercent / 2;
    const halfAmount = Math.round(taxableAmount * (halfRate / 100) * 100) / 100;
    return { type: 'CGST_SGST', rate: halfRate, cgstAmount: halfAmount, sgstAmount: halfAmount };
  }

  const igstAmount = Math.round(taxableAmount * (gstRatePercent / 100) * 100) / 100;
  return { type: 'IGST', rate: gstRatePercent, igstAmount };
}

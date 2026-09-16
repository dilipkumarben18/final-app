const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones ? `${TENS[tens]} ${ONES[ones]}` : TENS[tens];
}

function threeDigitWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));
  return parts.join(' ');
}

/** Converts a non-negative integer into words using the Indian numbering
 * system (Crore/Lakh/Thousand), e.g. 207900 -> "Two Lakh Seven Thousand
 * Nine Hundred". */
function integerToIndianWords(value: number): string {
  if (value === 0) return 'Zero';

  const crore = Math.floor(value / 10000000);
  const lakh = Math.floor((value % 10000000) / 100000);
  const thousand = Math.floor((value % 100000) / 1000);
  const hundred = value % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigitWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(threeDigitWords(hundred));

  return parts.join(' ');
}

/** Formats a rupee amount as words for the "Amount In Words" line on a
 * printed bill, e.g. 207900 -> "Two Lakh Seven Thousand Nine Hundred
 * Rupees only", 1234.50 -> "One Thousand Two Hundred Thirty Four Rupees
 * and Fifty Paise only". */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  const rupeeWords = `${integerToIndianWords(rupees)} Rupees`;
  if (paise > 0) {
    return `${rupeeWords} and ${integerToIndianWords(paise)} Paise only`;
  }
  return `${rupeeWords} only`;
}

// Indian digit-grouping (12,96,000.00, not 1296000.00), matching how a
// real GST bill is printed. No currency prefix — for table cells where a
// column header already implies "amount".
export function formatNumber(amount: number): string {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The ₹ glyph isn't in the PDF viewer's base Helvetica font (only basic
// Latin/WinAnsi is guaranteed), so it renders as a garbled fallback glyph
// in @react-pdf/renderer output — "Rs." avoids that entirely.
export function formatCurrency(amount: number): string {
  return `Rs. ${formatNumber(amount)}`;
}

/** DD-MM-YYYY, matching standard Indian bill date formatting. */
export function formatBillDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getFullYear()}`;
}

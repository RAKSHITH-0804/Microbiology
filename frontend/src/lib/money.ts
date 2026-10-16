/**
 * The API sends and accepts amounts as integer paise. Rupees only exist at the edges: what the user
 * types and what is displayed. Conversions work on the digits, never through floating point.
 */

const RUPEES_PATTERN = /^(\d{1,8})(?:\.(\d{1,2}))?$/;

/** "150.5" -> 15050; null when the text is not a valid amount. */
export function rupeesToPaise(text: string): number | null {
  const m = RUPEES_PATTERN.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** Plain rupees with 2 decimals, e.g. 15050 -> "150.50". */
export function paiseToRupeeString(paise: number): string {
  const abs = Math.abs(paise);
  return `${paise < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Prefills an amount input: 15000 -> "150", 15050 -> "150.50", 0 -> "". */
export function paiseToRupeeInput(paise: number): string {
  if (!paise) return '';
  return paise % 100 ? paiseToRupeeString(paise) : String(Math.floor(paise / 100));
}

/** Display with the Indian digit grouping, e.g. 12345650 -> "₹1,23,456.50". */
export function formatPaise(paise: number): string {
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100).toLocaleString('en-IN');
  return `${paise < 0 ? '-' : ''}₹${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/** Rupees as a number, only for spreadsheet cells that must stay numeric. */
export const paiseToRupeeNumber = (paise: number) => paise / 100;

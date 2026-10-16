/**
 * Amounts are stored as NUMERIC(10,2) rupees but cross the API, and are compared and summed in
 * code, as integer paise so no floating-point rounding can creep into a bill.
 */

/** Largest amount a NUMERIC(10,2) column holds, in paise (Rs 99,999,999.99). */
export const MAX_PAISE = 9_999_999_999;

/** SQL expression: a rupee column as integer paise. */
export const paise = (column: string) => `(${column} * 100)::int8`;

/** SQL expression: sum of a rupee column as integer paise (0 when there are no rows). */
export const sumPaise = (column: string) => `COALESCE(SUM(${column} * 100), 0)::int8`;

/** SQL expression: a bound paise parameter as rupees for storing in a NUMERIC column. */
export const rupeesParam = (param: string) => `(${param}::int8 / 100.0)`;

/** Rupees as a plain decimal string, e.g. 15050 -> "150.50"; used for audit entries. */
export function formatPaise(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

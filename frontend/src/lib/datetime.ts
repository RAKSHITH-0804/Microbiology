const pad = (n: number) => String(n).padStart(2, '0');

/** Formats a Date as the local "YYYY-MM-DDTHH:mm" string expected by <input type="datetime-local">. */
export function toDateTimeLocal(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Converts a datetime-local value (interpreted in the browser's timezone) to an ISO string, or null if empty. */
export function dateTimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

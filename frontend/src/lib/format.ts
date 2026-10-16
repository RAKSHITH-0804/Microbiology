import { format } from 'date-fns';
import type { AgeUnit, Sex } from '@/types/requisition';

interface AgeParts {
  age_value: number | null;
  age_unit: AgeUnit;
  age_years: number | null;
  age_months: number | null;
  age_days: number | null;
}

/**
 * Clean single-unit display when only one part is set (`25 Y`, `6 M`, `10 D`).
 * Legacy composites with several non-zero parts still join as `3 M 10 D`.
 * Falls back to age_value/age_unit for records saved before the split fields existed.
 */
export function formatAge(p: AgeParts): string {
  const hasParts = p.age_years !== null || p.age_months !== null || p.age_days !== null;
  if (!hasParts) return p.age_value !== null ? `${p.age_value} ${p.age_unit}` : '-';

  const parts: string[] = [];
  if (p.age_years) parts.push(`${p.age_years} Y`);
  if (p.age_months) parts.push(`${p.age_months} M`);
  if (p.age_days) parts.push(`${p.age_days} D`);
  return parts.length ? parts.join(' ') : '0 D';
}

const SEX_LABEL: Record<Sex, string> = { M: 'Male', F: 'Female', Other: 'Other' };

export const formatSex = (sex: Sex | null) => (sex ? SEX_LABEL[sex] : '-');

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? format(new Date(iso), 'dd MMM yyyy, hh:mm a') : '-';

export const formatDate = (iso: string | null | undefined) => (iso ? format(new Date(iso), 'dd MMM yyyy') : '-');

/** Adds the "Dr." title unless the stored name already carries it (e.g. "Dr.Usha.M.G"). */
export const formatDoctorName = (name: string) => (/^dr\b/i.test(name.trim()) ? name.trim() : `Dr. ${name.trim()}`);

/** Print signature title under "Reported by"; falls back when designation is missing. */
export function formatDoctorDesignation(designation: string | null | undefined): string {
  const cleaned = designation?.trim();
  if (!cleaned) return 'REPORTING DOCTOR';
  return cleaned.toUpperCase();
}

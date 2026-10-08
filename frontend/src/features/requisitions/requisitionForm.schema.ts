import type { FieldPath } from 'react-hook-form';
import { z } from 'zod';
import { dateTimeLocalToIso, toDateTimeLocal } from '@/lib/datetime';
import { HOSPITALS, type CreateRequisitionPayload, type Hospital, type PendingRequisition } from '@/types/requisition';

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const TEST_KEY_SEPARATOR = '||';

export const testKey = (category: string, name: string) => `${category}${TEST_KEY_SEPARATOR}${name}`;
export const testKeyCategory = (key: string) => key.split(TEST_KEY_SEPARATOR)[0];

const text = (max: number) => z.string().trim().max(max, `Must be at most ${max} characters`);

const agePart = (max: number, label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{1,3}$/.test(v), `${label} must be a whole number`)
    .refine((v) => v === '' || Number(v) <= max, `${label} must be at most ${max}`);

export const requisitionFormSchema = z
  .object({
    lab_no: text(50).min(1, 'Lab No is required'),
    receipt_no: text(50),
    sample_received_datetime: z.string().min(1, 'Receiving date & time is required'),

    patient_name: text(150).min(2, 'Patient name is required'),
    age: z
      .object({
        years: agePart(150, 'Years'),
        months: agePart(11, 'Months'),
        days: agePart(31, 'Days'),
      })
      .refine((a) => a.years !== '' || a.months !== '' || a.days !== '', {
        path: ['years'],
        message: 'Enter age in years, months or days',
      }),
    sex: z.string().refine((v) => ['M', 'F', 'Other'].includes(v), 'Select sex'),
    phone: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d{10}$/.test(v), 'Phone number must be exactly 10 digits'),
    consultant_doctor: text(150),
    op_ip_no: text(50),
    ward_unit: text(100),
    hospital: z.string().refine((v) => (HOSPITALS as readonly string[]).includes(v), 'Select a hospital'),
    hospital_other: text(150),
    clinical_diagnosis: text(2000),
    preferred_antibiotics: text(500),
    antibiotics_used: text(500),

    sample_nature: z.string().min(1, 'Select nature of sample'),
    site_of_collection: text(150),
    sample_collection_datetime: z.string(),

    tests: z.array(z.string()).min(1, 'Select at least one investigation'),
  })
  .superRefine((v, ctx) => {
    if (v.hospital === 'Other' && !v.hospital_other) {
      ctx.addIssue({ code: 'custom', path: ['hospital_other'], message: 'Specify the hospital name' });
    }

    const received = v.sample_received_datetime ? new Date(v.sample_received_datetime).getTime() : NaN;
    if (!Number.isNaN(received) && received > Date.now() + FUTURE_TOLERANCE_MS) {
      ctx.addIssue({ code: 'custom', path: ['sample_received_datetime'], message: 'Cannot be in the future' });
    }
  });

export type RequisitionFormValues = z.infer<typeof requisitionFormSchema>;

const orNull = (v: string) => (v.trim() ? v.trim() : null);
const numberOrNull = (v: string) => (v.trim() ? Number(v) : null);

const DOCTOR_PREFIX = /^dr(\.\s*|\s+)/i;

/** The name part of a consultant value, e.g. "Dr. K.N. Basavaraj" -> "K.N. Basavaraj". */
export const stripDoctorPrefix = (v: string) => v.replace(DOCTOR_PREFIX, '');

/** Form state stores the full "Dr. <name>"; an empty name stays empty. */
export const withDoctorPrefix = (name: string) => {
  const bare = stripDoctorPrefix(name);
  return bare.trim() ? `Dr. ${bare}` : '';
};

export function toCreatePayload(v: RequisitionFormValues): CreateRequisitionPayload {
  return {
    patient: {
      name: v.patient_name.trim(),
      age_years: numberOrNull(v.age.years),
      age_months: numberOrNull(v.age.months),
      age_days: numberOrNull(v.age.days),
      sex: v.sex as CreateRequisitionPayload['patient']['sex'],
      phone: orNull(v.phone),
    },
    lab_no: v.lab_no.trim(),
    receipt_no: orNull(v.receipt_no),
    hospital: v.hospital as Hospital,
    hospital_other: v.hospital === 'Other' ? orNull(v.hospital_other) : null,
    consultant_doctor: orNull(withDoctorPrefix(v.consultant_doctor.trim())),
    op_ip_no: orNull(v.op_ip_no),
    ward_unit: orNull(v.ward_unit),
    clinical_diagnosis: orNull(v.clinical_diagnosis),
    preferred_antibiotics: orNull(v.preferred_antibiotics),
    antibiotics_used: orNull(v.antibiotics_used),
    sample_nature: v.sample_nature,
    site_of_collection: orNull(v.site_of_collection),
    sample_collection_datetime: dateTimeLocalToIso(v.sample_collection_datetime),
    sample_received_datetime: dateTimeLocalToIso(v.sample_received_datetime)!,
    requisition_tests: v.tests.map((key) => {
      const [test_category, test_name] = key.split(TEST_KEY_SEPARATOR);
      return { test_category, test_name };
    }),
  };
}

/** Form values for editing a saved requisition. */
export function fromRequisition(r: PendingRequisition): RequisitionFormValues {
  const p = r.patient;
  const hasParts = p.age_years !== null || p.age_months !== null || p.age_days !== null;
  const part = (v: number | null) => (v ? String(v) : '');
  let age = { years: part(p.age_years), months: part(p.age_months), days: part(p.age_days) };
  if (!hasParts && p.age_value !== null) {
    const key = { Y: 'years', M: 'months', D: 'days' }[p.age_unit] as keyof typeof age;
    age = { ...age, [key]: String(p.age_value) };
  }
  if (!age.years && !age.months && !age.days && (hasParts || p.age_value !== null)) age = { ...age, days: '0' };

  const knownHospital = HOSPITALS.find((h) => h !== 'Other' && h === r.hospital);
  const localDateTime = (iso: string | null) => (iso ? toDateTimeLocal(new Date(iso)) : '');

  return {
    lab_no: r.lab_no,
    receipt_no: r.receipt_no ?? '',
    sample_received_datetime: localDateTime(r.sample_received_datetime),
    patient_name: p.name,
    age,
    sex: p.sex ?? '',
    phone: p.phone ?? '',
    consultant_doctor: r.consultant_doctor ?? '',
    op_ip_no: r.op_ip_no ?? '',
    ward_unit: r.ward_unit ?? '',
    hospital: knownHospital ?? (r.hospital ? 'Other' : ''),
    hospital_other: knownHospital ? '' : (r.hospital ?? ''),
    clinical_diagnosis: r.clinical_diagnosis ?? '',
    preferred_antibiotics: r.preferred_antibiotics ?? '',
    antibiotics_used: r.antibiotics_used ?? '',
    sample_nature: r.sample_nature ?? '',
    site_of_collection: r.site_of_collection ?? '',
    sample_collection_datetime: localDateTime(r.sample_collection_datetime),
    tests: r.tests.map((t) => testKey(t.test_category, t.test_name)),
  };
}

/** Maps API validation keys (e.g. "patient.name") back to form field names. */
export const SERVER_FIELD_MAP: Record<string, FieldPath<RequisitionFormValues>> = {
  'patient.name': 'patient_name',
  'patient.age_years': 'age.years',
  'patient.age_months': 'age.months',
  'patient.age_days': 'age.days',
  'patient.sex': 'sex',
  'patient.phone': 'phone',
  requisition_tests: 'tests',
};

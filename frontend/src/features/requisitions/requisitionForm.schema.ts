import type { FieldPath } from 'react-hook-form';
import { z } from 'zod';
import { dateTimeLocalToIso, toDateTimeLocal } from '@/lib/datetime';
import {
  HOSPITALS,
  type AgeUnit,
  type CreateRequisitionPayload,
  type Hospital,
  type PendingRequisition,
} from '@/types/requisition';
import { checkPaymentForm, computePayment, paymentFormFields, paymentFormFrom } from './payment';

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const TEST_KEY_SEPARATOR = '||';

export const testKey = (category: string, name: string) => `${category}${TEST_KEY_SEPARATOR}${name}`;
export const testKeyCategory = (key: string) => key.split(TEST_KEY_SEPARATOR)[0];

const text = (max: number) => z.string().trim().max(max, `Must be at most ${max} characters`);

/** Limits match the backend patient schema (years ≤ 150, months ≤ 11, days ≤ 31). */
export const AGE_UNIT_OPTIONS = [
  { unit: 'Y' as const, label: 'Y', full: 'Years', max: 150, maxLength: 3 },
  { unit: 'M' as const, label: 'M', full: 'Months', max: 11, maxLength: 2 },
  { unit: 'D' as const, label: 'D', full: 'Days', max: 31, maxLength: 2 },
] as const;

const ageMax = (unit: AgeUnit) => AGE_UNIT_OPTIONS.find((o) => o.unit === unit)!.max;

const requisitionFormFields = z
  .object({
    lab_no: text(50).min(1, 'Lab No. is required'),
    receipt_no: text(50),
    sample_received_datetime: z.string().min(1, 'Receiving date & time is required'),

    patient_name: text(150).min(2, 'Patient name is required'),
    age: z
      .object({
        value: z.string().trim(),
        unit: z.enum(['Y', 'M', 'D']),
      })
      .superRefine((a, ctx) => {
        if (a.value === '') {
          ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter age' });
          return;
        }
        if (!/^\d{1,3}$/.test(a.value)) {
          ctx.addIssue({ code: 'custom', path: ['value'], message: 'Age must be a whole number' });
          return;
        }
        const max = ageMax(a.unit);
        if (Number(a.value) > max) {
          ctx.addIssue({ code: 'custom', path: ['value'], message: `Age must be at most ${max} ${a.unit === 'Y' ? 'years' : a.unit === 'M' ? 'months' : 'days'}` });
        }
      }),
    sex: z.string().refine((v) => ['M', 'F', 'Other'].includes(v), 'Select sex'),
    phone: z
      .string()
      .trim()
      .min(1, 'Phone number is required')
      .regex(/^\d{10}$/, 'Phone number must be exactly 10 digits'),
    address: text(500),
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

    ...paymentFormFields,
    /** Edits only: required by the server for verified or reduced fully paid bills. */
    billing_reason: text(500),
  });

/** Billing is only validated for staff who see the Billing & Payment card (not doctors). */
export const buildRequisitionFormSchema = (withBilling: boolean, referralOnRecord = false) =>
  requisitionFormFields.superRefine((v, ctx) => {
    if (withBilling) checkPaymentForm(v, ctx, referralOnRecord);

    if (v.hospital === 'Other' && !v.hospital_other) {
      ctx.addIssue({ code: 'custom', path: ['hospital_other'], message: 'Specify the hospital name' });
    }

    const received = v.sample_received_datetime ? new Date(v.sample_received_datetime).getTime() : NaN;
    if (!Number.isNaN(received) && received > Date.now() + FUTURE_TOLERANCE_MS) {
      ctx.addIssue({ code: 'custom', path: ['sample_received_datetime'], message: 'Cannot be in the future' });
    }
  });

export type RequisitionFormValues = z.infer<typeof requisitionFormFields>;

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

/** Maps the single-unit form age into the API's years/months/days fields (unused units stay null). */
export function agePartsForPayload(age: RequisitionFormValues['age']) {
  const n = numberOrNull(age.value);
  return {
    age_years: age.unit === 'Y' ? n : null,
    age_months: age.unit === 'M' ? n : null,
    age_days: age.unit === 'D' ? n : null,
  };
}

export function toCreatePayload(v: RequisitionFormValues): CreateRequisitionPayload {
  return {
    patient: {
      name: v.patient_name.trim(),
      ...agePartsForPayload(v.age),
      sex: v.sex as CreateRequisitionPayload['patient']['sex'],
      phone: v.phone.trim(),
    },
    address: orNull(v.address),
    ...computePayment(v),
    billing_reason: orNull(v.billing_reason),
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

/** Picks one unit for the form: largest non-zero part, then the legacy single-unit age. */
export function ageFormFromPatient(p: PendingRequisition['patient']): RequisitionFormValues['age'] {
  const hasParts = p.age_years !== null || p.age_months !== null || p.age_days !== null;
  if (hasParts) {
    if (p.age_years) return { value: String(p.age_years), unit: 'Y' };
    if (p.age_months) return { value: String(p.age_months), unit: 'M' };
    return { value: String(p.age_days ?? 0), unit: 'D' };
  }
  if (p.age_value !== null) return { value: String(p.age_value), unit: p.age_unit };
  return { value: '', unit: 'Y' };
}

/** Form values for editing a saved requisition. */
export function fromRequisition(r: PendingRequisition): RequisitionFormValues {
  const p = r.patient;
  const knownHospital = HOSPITALS.find((h) => h !== 'Other' && h === r.hospital);
  const localDateTime = (iso: string | null) => (iso ? toDateTimeLocal(new Date(iso)) : '');

  return {
    lab_no: r.lab_no,
    receipt_no: r.receipt_no ?? '',
    sample_received_datetime: localDateTime(r.sample_received_datetime),
    patient_name: p.name,
    age: ageFormFromPatient(p),
    sex: p.sex ?? '',
    phone: p.phone ?? '',
    address: r.address ?? '',
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
    ...paymentFormFrom(r),
    billing_reason: '',
  };
}

/** Maps API validation keys (e.g. "patient.name") back to form field names. */
export const SERVER_FIELD_MAP: Record<string, FieldPath<RequisitionFormValues>> = {
  'patient.name': 'patient_name',
  'patient.age_years': 'age.value',
  'patient.age_months': 'age.value',
  'patient.age_days': 'age.value',
  'patient.sex': 'sex',
  'patient.phone': 'phone',
  requisition_tests: 'tests',
  total_amount_paise: 'total_amount',
  paid_amount_paise: 'paid_amount',
};

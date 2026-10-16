import { z } from 'zod';
import { reasonText } from '../reports/report.schema';
import { PAYMENT_STATUSES, paymentFields } from './payment';

export const HOSPITALS = ['CGH', 'BH', 'PVT', 'WCH', 'Other'] as const;

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Trimmed optional text; empty strings become null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));

const dateTime = z.coerce.date({ invalid_type_error: 'Invalid date/time' });

const agePart = (max: number, label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)
    .max(max, `${label} must be at most ${max}`)
    .nullish()
    .transform((v) => v ?? null);

export const patientSchema = z
  .object({
    name: z.string().trim().min(2, 'Patient name is required').max(150),
    age_years: agePart(150, 'Years'),
    age_months: agePart(11, 'Months'),
    age_days: agePart(31, 'Days'),
    sex: z.enum(['M', 'F', 'Other']),
    phone: z
      .string({ required_error: 'Phone number is required' })
      .trim()
      .min(1, 'Phone number is required')
      .regex(/^\d{10}$/, 'Phone number must be exactly 10 digits'),
  })
  .refine((p) => p.age_years !== null || p.age_months !== null || p.age_days !== null, {
    path: ['age_years'],
    message: 'Enter age in years, months or days',
  })
  .transform((p) => {
    const years = p.age_years ?? 0;
    const months = p.age_months ?? 0;
    const days = p.age_days ?? 0;
    // Single-unit summary kept in age_value/age_unit: the largest non-zero unit.
    const [age_value, age_unit] =
      years > 0 ? [years, 'Y' as const] : months > 0 ? [months, 'M' as const] : [days, 'D' as const];
    return { ...p, age_years: years, age_months: months, age_days: days, age_value, age_unit };
  });

export const requisitionTestSchema = z.object({
  test_category: z.string().trim().min(1).max(100),
  test_name: z.string().trim().min(1).max(200),
});

export const createRequisitionSchema = z
  .object({
    patient: patientSchema,
    lab_no: z.string().trim().min(1, 'Lab No is required').max(50),
    receipt_no: optionalText(50),
    address: optionalText(500),
    hospital: z.enum(HOSPITALS, { errorMap: () => ({ message: 'Select a hospital' }) }),
    hospital_other: optionalText(150),
    consultant_doctor: optionalText(150).transform((v) => {
      const name = v?.replace(/^dr(\.\s*|\s+)/i, '').trim();
      return name ? `Dr. ${name}` : null;
    }),
    op_ip_no: optionalText(50),
    ward_unit: optionalText(100),
    clinical_diagnosis: optionalText(2000),
    preferred_antibiotics: optionalText(500),
    antibiotics_used: optionalText(500),
    sample_nature: z.string().trim().min(1, 'Nature of sample is required').max(150),
    site_of_collection: optionalText(150),
    sample_collection_datetime: dateTime.nullish().transform((v) => v ?? null),
    sample_received_datetime: dateTime.default(() => new Date()),
    requisition_tests: z
      .array(requisitionTestSchema)
      .min(1, 'Select at least one investigation')
      .max(50)
      .refine(
        (tests) => new Set(tests.map((t) => `${t.test_category}|${t.test_name}`)).size === tests.length,
        'Duplicate investigations selected',
      ),
    // Cross-field billing rules (paid <= total, mode when paid) are enforced by billingFor() in the controller.
    ...paymentFields,
    /** Edits only: why a verified or fully paid bill is being changed. */
    billing_reason: optionalText(500),
  })
  .superRefine((data, ctx) => {
    if (data.hospital === 'Other' && !data.hospital_other) {
      ctx.addIssue({ code: 'custom', path: ['hospital_other'], message: 'Specify the hospital name' });
    }
    if (data.sample_received_datetime.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      ctx.addIssue({ code: 'custom', path: ['sample_received_datetime'], message: 'Received time cannot be in the future' });
    }
  });

export type CreateRequisitionInput = z.infer<typeof createRequisitionSchema>;

export const REQUISITION_STATUSES = ['RECEIVED', 'REPORT_ENTERED', 'VERIFIED'] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

export const listRequisitionsQuery = z
  .object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(REQUISITION_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    fromDate: isoDate.optional(),
    toDate: isoDate.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((q) => !q.fromDate || !q.toDate || q.fromDate <= q.toDate, {
    path: ['toDate'],
    message: 'To date must be on or after the from date',
  });

export type ListRequisitionsQuery = z.infer<typeof listRequisitionsQuery>;

export const statusSearchQuery = z.object({
  q: z.string().trim().max(100).optional(),
});

export type StatusSearchQuery = z.infer<typeof statusSearchQuery>;

export const cancelRequisitionSchema = z.object({ reason: reasonText('cancelling this requisition') });
export type CancelRequisitionInput = z.infer<typeof cancelRequisitionSchema>;

import { z } from 'zod';
import { PAYMENT_MODES, PAYMENT_STATUSES } from '../requisitions/payment';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

const rangeFields = {
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  paymentMode: z.enum(PAYMENT_MODES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
};

const validRange = (q: { startDate?: string; endDate?: string }) => !q.startDate || !q.endDate || q.startDate <= q.endDate;
const rangeIssue = { path: ['endDate'], message: 'End date must be on or after the start date' };

export const paymentSummaryQuery = z.object(rangeFields).refine(validRange, rangeIssue);
export type PaymentSummaryQuery = z.infer<typeof paymentSummaryQuery>;

export const paymentHistoryQuery = z
  .object({
    ...rangeFields,
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    /** Up to 5000 so the CSV export can pull the whole filtered range in one request. */
    limit: z.coerce.number().int().min(1).max(5000).default(25),
  })
  .refine(validRange, rangeIssue);
export type PaymentHistoryQuery = z.infer<typeof paymentHistoryQuery>;

export const patientLedgerQuery = z
  .object({
    phone_no: z.string().trim().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits').optional(),
    patient_name: z.string().trim().min(2, 'Enter at least 2 characters').max(150).optional(),
  })
  .refine((q) => q.phone_no || q.patient_name, { path: ['phone_no'], message: 'Enter a phone number or patient name' });
export type PatientLedgerQuery = z.infer<typeof patientLedgerQuery>;

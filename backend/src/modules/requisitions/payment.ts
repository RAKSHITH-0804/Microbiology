import { z } from 'zod';

export const PAYMENT_STATUSES = ['PAID', 'PARTIAL', 'UNPAID', 'EXEMPT'] as const;
export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'HOSPITAL_CREDIT'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** Only these statuses release a requisition to the Pending Worklist for report entry. */
export const RELEASED_PAYMENT_STATUSES: readonly PaymentStatus[] = ['PAID', 'EXEMPT'];

/** Hospital credit means the patient is not billed at the counter, so the requisition is exempt. */
export function derivePaymentStatus(total: number, paid: number, mode: PaymentMode | null): PaymentStatus {
  if (mode === 'HOSPITAL_CREDIT') return 'EXEMPT';
  if (total > 0 && paid >= total) return 'PAID';
  return paid > 0 ? 'PARTIAL' : 'UNPAID';
}

const amount = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(99_999_999.99, `${label} is too large`)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `${label} can have at most 2 decimal places`)
    .default(0);

export const paymentFields = {
  total_amount: amount('Total amount'),
  paid_amount: amount('Amount paid'),
  payment_mode: z
    .enum(PAYMENT_MODES, { errorMap: () => ({ message: 'Select a valid payment mode' }) })
    .nullish()
    .transform((v) => v ?? null),
  /** Optional; when sent it must agree with the amounts, which are the source of truth. */
  payment_status: z.enum(PAYMENT_STATUSES).optional(),
};

type PaymentInput = {
  total_amount: number;
  paid_amount: number;
  payment_mode: PaymentMode | null;
  payment_status?: PaymentStatus;
};

export function checkPayment(v: PaymentInput, ctx: z.RefinementCtx) {
  const exempt = v.payment_mode === 'HOSPITAL_CREDIT';
  if (!exempt && v.total_amount <= 0) {
    ctx.addIssue({ code: 'custom', path: ['total_amount'], message: 'Enter the total amount' });
  }
  if (v.paid_amount > v.total_amount) {
    ctx.addIssue({ code: 'custom', path: ['paid_amount'], message: 'Amount paid cannot exceed the total amount' });
  }
  if (v.paid_amount > 0 && !v.payment_mode) {
    ctx.addIssue({ code: 'custom', path: ['payment_mode'], message: 'Select the payment mode' });
  }
  const derived = derivePaymentStatus(v.total_amount, v.paid_amount, v.payment_mode);
  if (v.payment_status && v.payment_status !== derived) {
    ctx.addIssue({
      code: 'custom',
      path: ['payment_status'],
      message: `Payment status must be ${derived} for these amounts`,
    });
  }
}

export const updatePaymentSchema = z.object(paymentFields).superRefine(checkPayment);
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;

export interface Billing {
  total_amount: number;
  paid_amount: number;
  payment_mode: PaymentMode | null;
  payment_status: PaymentStatus;
}

/** Billing to store from a requisition save. Throws a ZodError (400) when the amounts are invalid. */
export function billingFor(body: Partial<Record<keyof UpdatePaymentInput, unknown>>): Billing {
  const p = updatePaymentSchema.parse({
    total_amount: body.total_amount,
    paid_amount: body.paid_amount,
    payment_mode: body.payment_mode,
    payment_status: body.payment_status,
  });
  return { ...p, payment_status: derivePaymentStatus(p.total_amount, p.paid_amount, p.payment_mode) };
}

import { z } from 'zod';
import { formatPaise, MAX_PAISE } from '../../utils/money';

export const PAYMENT_STATUSES = ['PAID', 'PARTIAL', 'UNPAID', 'HOSPITAL_CREDIT', 'EXEMPT'] as const;
export const PAYMENT_MODES = ['CASH', 'CARD', 'UPI', 'HOSPITAL_CREDIT', 'EXEMPT'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** Only these statuses release a requisition to the Pending Worklist for report entry. */
export const RELEASED_PAYMENT_STATUSES: readonly PaymentStatus[] = ['PAID', 'HOSPITAL_CREDIT', 'EXEMPT'];

/** Hospital credit and exemption need no counter payment; the mode alone decides the status. Amounts in paise. */
export function derivePaymentStatus(total: number, paid: number, mode: PaymentMode | null): PaymentStatus {
  if (mode === 'HOSPITAL_CREDIT') return 'HOSPITAL_CREDIT';
  if (mode === 'EXEMPT') return 'EXEMPT';
  if (total > 0 && paid >= total) return 'PAID';
  return paid > 0 ? 'PARTIAL' : 'UNPAID';
}

const amountPaise = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number of paise`)
    .min(0, `${label} cannot be negative`)
    .max(MAX_PAISE, `${label} is too large`)
    .default(0);

export const paymentFields = {
  total_amount_paise: amountPaise('Total amount'),
  paid_amount_paise: amountPaise('Amount paid'),
  payment_mode: z
    .enum(PAYMENT_MODES, { errorMap: () => ({ message: 'Select a valid payment mode' }) })
    .nullish()
    .transform((v) => v ?? null),
  /** Optional; when sent it must agree with the amounts, which are the source of truth. */
  payment_status: z.enum(PAYMENT_STATUSES).optional(),
  /** Who referred or authorised a fee exemption; required for EXEMPT, ignored otherwise. */
  exempt_referred_by: z
    .string()
    .trim()
    .max(255, 'Referred by must be at most 255 characters')
    .nullish()
    .transform((v) => (v ? v : null)),
};

type PaymentInput = {
  total_amount_paise: number;
  paid_amount_paise: number;
  payment_mode: PaymentMode | null;
  payment_status?: PaymentStatus;
  exempt_referred_by: string | null;
};

export function checkPayment(v: PaymentInput, ctx: z.RefinementCtx) {
  const exempt = v.payment_mode === 'EXEMPT';
  if (!exempt && v.total_amount_paise <= 0) {
    ctx.addIssue({ code: 'custom', path: ['total_amount_paise'], message: 'Enter the total amount' });
  }
  if (exempt && !v.exempt_referred_by) {
    ctx.addIssue({
      code: 'custom',
      path: ['exempt_referred_by'],
      message: 'Enter who referred or authorised the exemption',
    });
  }
  if (v.paid_amount_paise > v.total_amount_paise) {
    ctx.addIssue({ code: 'custom', path: ['paid_amount_paise'], message: 'Amount paid cannot exceed the total amount' });
  }
  if (v.paid_amount_paise > 0 && !v.payment_mode) {
    ctx.addIssue({ code: 'custom', path: ['payment_mode'], message: 'Select the payment mode' });
  }
  const derived = derivePaymentStatus(v.total_amount_paise, v.paid_amount_paise, v.payment_mode);
  if (v.payment_status && v.payment_status !== derived) {
    ctx.addIssue({
      code: 'custom',
      path: ['payment_status'],
      message: `Payment status must be ${derived} for these amounts`,
    });
  }
}

const billingSchema = z.object(paymentFields).superRefine(checkPayment);

/** Minimum length of the HOD's reason for changing the bill of a verified requisition. */
export const OVERRIDE_REASON_MIN = 10;

export const updatePaymentSchema = z
  .object({
    ...paymentFields,
    /** Required once the requisition is verified (HOD only), and when lowering a fully paid bill. */
    reason: z.string().trim().max(500, 'Reason is too long').optional(),
  })
  .superRefine(checkPayment);
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;

export interface Billing {
  total_amount_paise: number;
  paid_amount_paise: number;
  payment_mode: PaymentMode | null;
  payment_status: PaymentStatus;
  exempt_referred_by: string | null;
}

/** Billing to store from a save. Throws a ZodError (400) when the amounts are invalid. */
export function billingFor(body: Partial<Record<keyof Billing, unknown>>): Billing {
  const p = billingSchema.parse({
    total_amount_paise: body.total_amount_paise,
    paid_amount_paise: body.paid_amount_paise,
    payment_mode: body.payment_mode,
    payment_status: body.payment_status,
    exempt_referred_by: body.exempt_referred_by,
  });
  return {
    total_amount_paise: p.total_amount_paise,
    paid_amount_paise: p.paid_amount_paise,
    payment_mode: p.payment_mode,
    payment_status: derivePaymentStatus(p.total_amount_paise, p.paid_amount_paise, p.payment_mode),
    exempt_referred_by: p.payment_mode === 'EXEMPT' ? p.exempt_referred_by : null,
  };
}

/** Lowering the amount billed or paid on a fully paid bill (a refund or correction) needs a written reason. */
export const lowersPaidBill = (
  before: { payment_status: string; total_amount_paise: number; paid_amount_paise: number },
  after: Billing,
) =>
  before.payment_status === 'PAID' &&
  (after.paid_amount_paise < before.paid_amount_paise || after.total_amount_paise < before.total_amount_paise);

/** Billing as stored in audit entries: rupee strings under the `_amount` keys the audit viewer formats. */
export const auditBilling = (b: Billing) => ({
  total_amount: formatPaise(b.total_amount_paise),
  paid_amount: formatPaise(b.paid_amount_paise),
  payment_status: b.payment_status,
  payment_mode: b.payment_mode,
  exempt_referred_by: b.exempt_referred_by,
});

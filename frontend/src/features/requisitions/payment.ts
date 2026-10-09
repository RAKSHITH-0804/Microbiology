import { z } from 'zod';
import { PAYMENT_MODES, type PaymentMode, type PaymentPayload, type PaymentStatus } from '@/types/requisition';

/** Mirrors the server rule; the server re-derives the status and rejects a mismatch. */
export function derivePaymentStatus(total: number, paid: number, mode: PaymentMode | null): PaymentStatus {
  if (mode === 'HOSPITAL_CREDIT') return 'HOSPITAL_CREDIT';
  if (mode === 'EXEMPT') return 'EXEMPT';
  if (total > 0 && paid >= total) return 'PAID';
  return paid > 0 ? 'PARTIAL' : 'UNPAID';
}

export const isReleasedForReporting = (status: PaymentStatus) =>
  status === 'PAID' || status === 'HOSPITAL_CREDIT' || status === 'EXEMPT';

/** Modes settled without a counter payment: billed to the hospital, or waived. */
export const isNoCounterPayment = (mode: PaymentMode | string | null) => mode === 'HOSPITAL_CREDIT' || mode === 'EXEMPT';

export const RELEASE_RULE_TEXT =
  'Requisitions advance to the Pending Worklist for reporting once payment status is Paid, Hospital Credit or Exempt.';

/** Mirrors the server: the HOD's reason for changing the bill of a verified requisition. */
export const OVERRIDE_REASON_MIN = 10;

export const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  { label: string; tone: 'emerald' | 'amber' | 'red' | 'blue' | 'violet' }
> = {
  PAID: { label: 'Paid', tone: 'emerald' },
  PARTIAL: { label: 'Partial', tone: 'amber' },
  UNPAID: { label: 'Unpaid', tone: 'red' },
  HOSPITAL_CREDIT: { label: 'Hospital Credit', tone: 'blue' },
  EXEMPT: { label: 'Exempt', tone: 'violet' },
};

export const paymentModeLabel = (mode: PaymentMode | null) =>
  PAYMENT_MODES.find((m) => m.value === mode)?.label ?? null;

const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

const amount = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || AMOUNT_PATTERN.test(v), `${label} must be a valid amount (max 2 decimals)`);

export const paymentFormFields = {
  total_amount: amount('Total amount'),
  paid_amount: amount('Amount paid'),
  payment_mode: z.string(),
  exempt_referred_by: z.string().trim().max(255, 'Must be at most 255 characters'),
};

export type PaymentFormValues = {
  total_amount: string;
  paid_amount: string;
  payment_mode: string;
  exempt_referred_by: string;
};

/** Most counter payments are cash, so new bills start on it. */
export const EMPTY_PAYMENT: PaymentFormValues = { total_amount: '', paid_amount: '', payment_mode: 'CASH', exempt_referred_by: '' };

const toAmount = (v: string) => (AMOUNT_PATTERN.test(v.trim()) ? Number(v) : 0);
const toMode = (v: string) => (PAYMENT_MODES.some((m) => m.value === v) ? (v as PaymentMode) : null);

export function computePayment(v: PaymentFormValues): PaymentPayload {
  const total = toAmount(v.total_amount);
  const paid = toAmount(v.paid_amount);
  const mode = toMode(v.payment_mode);
  return {
    total_amount: total,
    paid_amount: paid,
    payment_mode: mode,
    payment_status: derivePaymentStatus(total, paid, mode),
    exempt_referred_by: mode === 'EXEMPT' ? v.exempt_referred_by.trim() || null : null,
  };
}

export function checkPaymentForm(v: PaymentFormValues, ctx: z.RefinementCtx) {
  const { total_amount: total, paid_amount: paid, payment_mode: mode, exempt_referred_by } = computePayment(v);
  if (mode !== 'EXEMPT' && total <= 0) {
    ctx.addIssue({ code: 'custom', path: ['total_amount'], message: 'Enter the total amount' });
  }
  if (mode === 'EXEMPT' && !exempt_referred_by) {
    ctx.addIssue({ code: 'custom', path: ['exempt_referred_by'], message: 'Enter who referred or authorised the exemption' });
  }
  if (paid > total) {
    ctx.addIssue({ code: 'custom', path: ['paid_amount'], message: 'Cannot exceed the total amount' });
  }
  if (paid > 0 && !mode) {
    ctx.addIssue({ code: 'custom', path: ['payment_mode'], message: 'Select the payment mode' });
  }
}

export const paymentFormSchema = z.object(paymentFormFields).superRefine(checkPaymentForm);

export function paymentFormFrom(
  p: Pick<PaymentPayload, 'total_amount' | 'paid_amount' | 'payment_mode' | 'payment_status' | 'exempt_referred_by'>,
): PaymentFormValues {
  const fmt = (n: number) => (n ? String(n) : '');
  // Older exempt bills were saved without a mode; reopen them as Exempt so a save doesn't mark them Unpaid.
  const mode = p.payment_mode ?? (p.payment_status === 'EXEMPT' ? 'EXEMPT' : '');
  return {
    total_amount: fmt(p.total_amount),
    paid_amount: fmt(p.paid_amount),
    payment_mode: mode,
    exempt_referred_by: p.exempt_referred_by ?? '',
  };
}

/** Short guidance under the payment fields for the selected mode. */
export function paymentModeNote(mode: PaymentMode | null) {
  if (mode === 'HOSPITAL_CREDIT') {
    return 'Hospital credit: the bill is raised against the hospital, so no counter payment is needed and the sample goes straight to the Pending Worklist.';
  }
  if (mode === 'EXEMPT') {
    return "Exempt: the fee is waived on the exemption authority's approval, and the sample goes straight to the Pending Worklist.";
  }
  return RELEASE_RULE_TEXT;
}

export const EXEMPT_REFERRAL_LABEL = 'Referred By / Exemption Authority';
export const EXEMPT_REFERRAL_PLACEHOLDER = 'Name and designation, e.g. Medical Superintendent, CGH';

/** Keeps typed amounts in the "12345678.99" shape: digits, one dot, at most 2 decimals. */
export function sanitizeAmountInput(raw: string) {
  const [whole, ...rest] = raw.replace(/[^\d.]/g, '').split('.');
  const int = whole.slice(0, 8);
  return rest.length ? `${int}.${rest.join('').slice(0, 2)}` : int;
}

export const formatRupees = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

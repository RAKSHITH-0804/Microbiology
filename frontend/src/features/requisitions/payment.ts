import { z } from 'zod';
import { PAYMENT_MODES, type PaymentMode, type PaymentPayload, type PaymentStatus } from '@/types/requisition';

/** Mirrors the server rule; the server re-derives the status and rejects a mismatch. */
export function derivePaymentStatus(total: number, paid: number, mode: PaymentMode | null): PaymentStatus {
  if (mode === 'HOSPITAL_CREDIT') return 'EXEMPT';
  if (total > 0 && paid >= total) return 'PAID';
  return paid > 0 ? 'PARTIAL' : 'UNPAID';
}

export const isReleasedForReporting = (status: PaymentStatus) => status === 'PAID' || status === 'EXEMPT';

export const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  { label: string; tone: 'emerald' | 'amber' | 'red' | 'violet' }
> = {
  PAID: { label: 'Paid', tone: 'emerald' },
  PARTIAL: { label: 'Partial', tone: 'amber' },
  UNPAID: { label: 'Unpaid', tone: 'red' },
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
};

export type PaymentFormValues = { total_amount: string; paid_amount: string; payment_mode: string };

export const EMPTY_PAYMENT: PaymentFormValues = { total_amount: '', paid_amount: '', payment_mode: '' };

const toAmount = (v: string) => (AMOUNT_PATTERN.test(v.trim()) ? Number(v) : 0);
const toMode = (v: string) => (PAYMENT_MODES.some((m) => m.value === v) ? (v as PaymentMode) : null);

export function computePayment(v: PaymentFormValues): PaymentPayload {
  const total = toAmount(v.total_amount);
  const paid = toAmount(v.paid_amount);
  const mode = toMode(v.payment_mode);
  return { total_amount: total, paid_amount: paid, payment_mode: mode, payment_status: derivePaymentStatus(total, paid, mode) };
}

export function checkPaymentForm(v: PaymentFormValues, ctx: z.RefinementCtx) {
  const { total_amount: total, paid_amount: paid, payment_mode: mode } = computePayment(v);
  if (mode !== 'HOSPITAL_CREDIT' && total <= 0) {
    ctx.addIssue({ code: 'custom', path: ['total_amount'], message: 'Enter the total amount' });
  }
  if (paid > total) {
    ctx.addIssue({ code: 'custom', path: ['paid_amount'], message: 'Cannot exceed the total amount' });
  }
  if (paid > 0 && !mode) {
    ctx.addIssue({ code: 'custom', path: ['payment_mode'], message: 'Select the payment mode' });
  }
}

export const paymentFormSchema = z.object(paymentFormFields).superRefine(checkPaymentForm);

export function paymentFormFrom(p: { total_amount: number; paid_amount: number; payment_mode: PaymentMode | null }): PaymentFormValues {
  const fmt = (n: number) => (n ? String(n) : '');
  return { total_amount: fmt(p.total_amount), paid_amount: fmt(p.paid_amount), payment_mode: p.payment_mode ?? '' };
}

/** Keeps typed amounts in the "12345678.99" shape: digits, one dot, at most 2 decimals. */
export function sanitizeAmountInput(raw: string) {
  const [whole, ...rest] = raw.replace(/[^\d.]/g, '').split('.');
  const int = whole.slice(0, 8);
  return rest.length ? `${int}.${rest.join('').slice(0, 2)}` : int;
}

export const formatRupees = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

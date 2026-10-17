import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertTriangle, Info, Loader2, Save, ShieldAlert } from 'lucide-react';
import { AmountInput } from '@/components/AmountInput';
import { FormField } from '@/components/FormField';
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { fieldErrors } from '@/features/admin/api';
import { updatePayment } from '@/features/requisitions/api';
import {
  computePayment,
  EMPTY_PAYMENT,
  EXEMPT_REFERRAL_LABEL,
  EXEMPT_REFERRAL_PLACEHOLDER,
  isNoCounterPayment,
  isReleasedForReporting,
  lowersPaidBill,
  OVERRIDE_REASON_MIN,
  paymentFormFrom,
  paymentFormKey,
  paymentModeNote,
  paymentFormSchema,
  type PaymentFormValues,
} from '@/features/requisitions/payment';
import { getErrorMessage } from '@/lib/api';
import { formatPaise, paiseToRupeeInput } from '@/lib/money';
import { PAYMENT_MODES, type PaymentTarget, type UpdatedPayment } from '@/types/requisition';

export function UpdatePaymentDialog({
  requisition,
  onClose,
  onSaved,
}: {
  requisition: PaymentTarget | null;
  onClose: () => void;
  onSaved: (result: UpdatedPayment) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({ resolver: zodResolver(paymentFormSchema), defaultValues: EMPTY_PAYMENT });

  const override = !!requisition?.is_verified;
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();

  useEffect(() => {
    if (requisition) reset(paymentFormFrom(requisition));
    setReason('');
    setReasonError(undefined);
  }, [requisition, reset]);

  const payment = computePayment({
    total_amount: watch('total_amount'),
    paid_amount: watch('paid_amount'),
    payment_mode: watch('payment_mode'),
    exempt_referred_by: watch('exempt_referred_by'),
  });
  const exempt = payment.payment_mode === 'EXEMPT';
  const noCounterPayment = isNoCounterPayment(payment.payment_mode);
  const balanceDue = Math.max(payment.total_amount_paise - payment.paid_amount_paise, 0);
  const reducingPaidBill = !!requisition && lowersPaidBill(requisition, payment);
  const needsReason = override || reducingPaidBill;
  const reasonMissing = needsReason && reason.trim().length < OVERRIDE_REASON_MIN;

  const onSubmit = async (v: PaymentFormValues) => {
    if (!requisition) return;
    try {
      const result = await updatePayment(requisition.id, computePayment(v), needsReason ? reason.trim() : undefined);
      if (!result.changed) toast.info('No payment changes to save');
      else if (isReleasedForReporting(result.payment_status) && !isReleasedForReporting(requisition.payment_status)) {
        toast.success(
          `Payment recorded - ${result.lab_no ?? requisition.lab_no ?? 'sample'} is now on the Pending Worklist`,
        );
      } else toast.success(`Payment updated for ${result.lab_no ?? requisition.lab_no ?? 'sample'}`);
      onSaved(result);
      onClose();
    } catch (err) {
      for (const [serverKey, message] of Object.entries(fieldErrors(err))) {
        const key = paymentFormKey(serverKey);
        if (key in EMPTY_PAYMENT) setError(key as keyof PaymentFormValues, { type: 'server', message });
        if (key === 'reason') setReasonError(message);
      }
      toast.error(getErrorMessage(err, 'Could not update the payment'));
    }
  };

  return (
    <Dialog open={!!requisition} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-lg">
        {requisition && (
          <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Update Payment <PaymentStatusBadge status={payment.payment_status} />
                {override && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                    <ShieldAlert className="h-3 w-3" /> HOD Override
                  </span>
                )}
              </DialogTitle>
              <DialogDescription>
                <span className="font-mono font-semibold text-foreground">
                  {requisition.lab_no || 'Pending Lab No'}
                </span>{' '}
                - {requisition.patient_name}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              {override && (
                <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  This report is verified. Modifying billing requires a mandatory audit reason.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Total Amount (₹)" htmlFor="pay_total" required={!exempt} error={errors.total_amount?.message}>
                  <AmountInput id="pay_total" aria-invalid={!!errors.total_amount} {...register('total_amount')} />
                </FormField>
                <FormField
                  label="Amount Paid (₹)"
                  htmlFor="pay_paid"
                  error={errors.paid_amount?.message}
                  hint={balanceDue > 0 && !noCounterPayment ? `Balance due ${formatPaise(balanceDue)}` : undefined}
                >
                  <AmountInput id="pay_paid" aria-invalid={!!errors.paid_amount} {...register('paid_amount')} />
                </FormField>
                <FormField label="Payment Mode" htmlFor="pay_mode" error={errors.payment_mode?.message}>
                  <NativeSelect id="pay_mode" aria-invalid={!!errors.payment_mode} {...register('payment_mode')}>
                    <option value="">Select mode</option>
                    {PAYMENT_MODES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </NativeSelect>
                </FormField>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={payment.total_amount_paise <= 0 || balanceDue === 0 || noCounterPayment}
                    onClick={() =>
                      setValue('paid_amount', paiseToRupeeInput(payment.total_amount_paise), { shouldValidate: true, shouldDirty: true })
                    }
                  >
                    Settle full amount
                  </Button>
                </div>
              </div>
              {exempt && (
                <FormField
                  label={EXEMPT_REFERRAL_LABEL}
                  htmlFor="pay_exempt_referred_by"
                  required
                  error={errors.exempt_referred_by?.message}
                >
                  <Input
                    id="pay_exempt_referred_by"
                    maxLength={255}
                    placeholder={EXEMPT_REFERRAL_PLACEHOLDER}
                    aria-invalid={!!errors.exempt_referred_by}
                    {...register('exempt_referred_by')}
                  />
                </FormField>
              )}
              {!override && reducingPaidBill && (
                <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  This bill is fully paid. Reducing the amount billed or paid requires a reason for the audit log.
                </p>
              )}
              {needsReason && (
                <FormField
                  label={override ? 'Override Reason' : 'Reason for Reducing a Paid Bill'}
                  htmlFor="pay_reason"
                  required
                  error={reasonError}
                  hint={`At least ${OVERRIDE_REASON_MIN} characters - saved to the audit log`}
                >
                  <Textarea
                    id="pay_reason"
                    value={reason}
                    maxLength={500}
                    aria-invalid={!!reasonError}
                    placeholder={
                      override
                        ? 'e.g. Balance of ₹200 received at the counter after the report was issued'
                        : 'e.g. ₹100 refunded: test cancelled at the patient’s request'
                    }
                    onChange={(e) => {
                      setReason(e.target.value);
                      setReasonError(undefined);
                    }}
                  />
                </FormField>
              )}
              <p className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {paymentModeNote(payment.payment_mode)}
              </p>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || reasonMissing}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
                {isSubmitting ? 'Saving...' : 'Save Payment'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

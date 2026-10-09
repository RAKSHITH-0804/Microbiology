import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Info, Loader2, Save } from 'lucide-react';
import { AmountInput } from '@/components/AmountInput';
import { FormField } from '@/components/FormField';
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { fieldErrors } from '@/features/admin/api';
import { updatePayment } from '@/features/requisitions/api';
import {
  computePayment,
  EMPTY_PAYMENT,
  formatRupees,
  isReleasedForReporting,
  paymentFormFrom,
  paymentFormSchema,
  type PaymentFormValues,
} from '@/features/requisitions/payment';
import { getErrorMessage } from '@/lib/api';
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

  useEffect(() => {
    if (requisition) reset(paymentFormFrom(requisition));
  }, [requisition, reset]);

  const payment = computePayment({
    total_amount: watch('total_amount'),
    paid_amount: watch('paid_amount'),
    payment_mode: watch('payment_mode'),
  });
  const balanceDue = Math.max(payment.total_amount - payment.paid_amount, 0);

  const onSubmit = async (v: PaymentFormValues) => {
    if (!requisition) return;
    try {
      const result = await updatePayment(requisition.id, computePayment(v));
      if (!result.changed) toast.info('No payment changes to save');
      else if (isReleasedForReporting(result.payment_status) && !isReleasedForReporting(requisition.payment_status)) {
        toast.success(`Payment recorded - ${result.lab_no} is now on the Pending Worklist`);
      } else toast.success(`Payment updated for ${result.lab_no}`);
      onSaved(result);
      onClose();
    } catch (err) {
      for (const [key, message] of Object.entries(fieldErrors(err))) {
        if (key in EMPTY_PAYMENT) setError(key as keyof PaymentFormValues, { type: 'server', message });
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
              </DialogTitle>
              <DialogDescription>
                <span className="font-mono font-semibold text-foreground">{requisition.lab_no}</span> - {requisition.patient_name}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Total Amount (₹)" htmlFor="pay_total" required={payment.payment_mode !== 'HOSPITAL_CREDIT'} error={errors.total_amount?.message}>
                  <AmountInput id="pay_total" aria-invalid={!!errors.total_amount} {...register('total_amount')} />
                </FormField>
                <FormField
                  label="Amount Paid (₹)"
                  htmlFor="pay_paid"
                  error={errors.paid_amount?.message}
                  hint={balanceDue > 0 && payment.payment_mode !== 'HOSPITAL_CREDIT' ? `Balance due ${formatRupees(balanceDue)}` : undefined}
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
                    disabled={payment.total_amount <= 0 || balanceDue === 0}
                    onClick={() => setValue('paid_amount', String(payment.total_amount), { shouldValidate: true, shouldDirty: true })}
                  >
                    Settle full amount
                  </Button>
                </div>
              </div>
              <p className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Requisitions will only advance to the Pending Worklist for reporting once payment status is marked as PAID or EXEMPT.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
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

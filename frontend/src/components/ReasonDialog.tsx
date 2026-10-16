import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { fieldErrors } from '@/features/admin/api';
import { getErrorMessage } from '@/lib/api';

/** Mirrors the server's minimum for written reasons (revoke, cancel, bill changes). */
export const REASON_MIN = 10;

/** Confirms an action that undoes earlier work and needs a written reason for the audit log. */
export function ReasonDialog({
  open,
  title,
  description,
  warning,
  confirmLabel,
  placeholder,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  warning: ReactNode;
  confirmLabel: string;
  placeholder?: string;
  onClose: () => void;
  /** Resolves when the action succeeded; a rejection keeps the dialog open with the error. */
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError(undefined);
  }, [open]);

  const tooShort = reason.trim().length < REASON_MIN;

  const submit = async () => {
    if (tooShort) {
      setError(`Enter at least ${REASON_MIN} characters`);
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(fieldErrors(err).reason);
      toast.error(getErrorMessage(err, `${confirmLabel} failed`));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{warning}</span>
          </p>
          <FormField
            label="Reason"
            htmlFor="action_reason"
            required
            error={error}
            hint={`At least ${REASON_MIN} characters - saved to the audit log`}
          >
            <Textarea
              id="action_reason"
              value={reason}
              maxLength={500}
              aria-invalid={!!error}
              placeholder={placeholder}
              onChange={(e) => {
                setReason(e.target.value);
                setError(undefined);
              }}
            />
          </FormField>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Keep as is
          </Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={submitting || tooShort}>
            {submitting && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

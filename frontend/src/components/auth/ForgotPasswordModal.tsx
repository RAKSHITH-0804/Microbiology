import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Send } from 'lucide-react';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { requestPasswordReset } from '@/features/settings/api';
import { getErrorMessage } from '@/lib/api';

interface ForgotPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whatever was already typed in the login form's username field. */
  initialUsername: string;
}

/** Files a password reset request that the Super Admin answers with a temporary password. */
export function ForgotPasswordModal({ open, onOpenChange, initialUsername }: ForgotPasswordModalProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsername(initialUsername.trim());
    setError(null);
    setSubmitted(false);
  }, [open, initialUsername]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = username.trim();
    if (!value) {
      setError('Enter your username or staff ID');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(value);
      setSubmitted(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not submit the request. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <form noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <DialogHeader className="pr-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <KeyRound className="h-5 w-5" />
              </div>
              <DialogTitle>Forgot Password?</DialogTitle>
            </div>
            <DialogDescription className="pt-1">
              Please enter your username. A password reset request will be submitted to the Super Admin.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {submitted ? (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p>
                  Password reset request submitted successfully. Please contact your Super Admin to receive your temporary
                  password.
                </p>
              </div>
            ) : (
              <FormField label="Username or Staff ID" htmlFor="forgot-username" required error={error ?? undefined}>
                <Input
                  id="forgot-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  maxLength={50}
                  aria-invalid={!!error}
                  placeholder="e.g. dr.sunita"
                />
              </FormField>
            )}
          </DialogBody>

          <DialogFooter>
            {submitted ? (
              <Button type="button" onClick={() => onOpenChange(false)}>
                Back to Sign In
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" /> : <Send />}
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

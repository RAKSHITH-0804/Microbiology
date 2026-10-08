import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { KeyRound, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { fieldErrors } from '@/features/admin/api';
import { changePassword } from '@/features/settings/api';
import { EMPTY_PASSWORDS, passwordSchema, type PasswordValues } from '@/features/settings/passwordSchema';
import { getErrorMessage } from '@/lib/api';

const preventClose = (e: Event) => e.preventDefault();

/** Blocks the whole app until a user still on a temporary password chooses their own. */
export function ForcePasswordChangeDialog({ onSignOut }: { onSignOut: () => void }) {
  const { user, markPasswordChanged } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: EMPTY_PASSWORDS });

  const onSubmit = async (v: PasswordValues) => {
    try {
      await changePassword(v.currentPassword, v.newPassword);
      markPasswordChanged();
      toast.success('Password changed successfully', { description: 'Welcome! You now have full access to the portal.' });
    } catch (err) {
      for (const [key, message] of Object.entries(fieldErrors(err))) {
        if (key in EMPTY_PASSWORDS) setError(key as keyof PasswordValues, { type: 'server', message });
      }
      toast.error(getErrorMessage(err, 'Could not change the password'));
    }
  };

  return (
    <Dialog open>
      <DialogContent
        hideClose
        onEscapeKeyDown={preventClose}
        onPointerDownOutside={preventClose}
        onInteractOutside={preventClose}
        className="max-w-md"
      >
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-col">
          <DialogHeader className="pr-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <KeyRound className="h-5 w-5" />
              </div>
              <DialogTitle>Set a New Password</DialogTitle>
            </div>
            <DialogDescription className="pt-1">
              Welcome{user ? `, ${user.name}` : ''}. You are signed in with a temporary password. Choose your own password to
              continue to the portal.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <FormField label="Temporary Password" htmlFor="force-currentPassword" required error={errors.currentPassword?.message}>
              <Input
                id="force-currentPassword"
                type="password"
                autoComplete="current-password"
                autoFocus
                aria-invalid={!!errors.currentPassword}
                {...register('currentPassword')}
              />
            </FormField>
            <FormField
              label="New Password"
              htmlFor="force-newPassword"
              required
              error={errors.newPassword?.message}
              hint="At least 6 characters. Do not share it with anyone."
            >
              <Input
                id="force-newPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.newPassword}
                {...register('newPassword')}
              />
            </FormField>
            <FormField label="Confirm New Password" htmlFor="force-confirmPassword" required error={errors.confirmPassword?.message}>
              <Input
                id="force-confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                {...register('confirmPassword')}
              />
            </FormField>
          </DialogBody>

          <DialogFooter className="justify-between">
            <Button type="button" variant="ghost" onClick={onSignOut} disabled={isSubmitting}>
              <LogOut /> Sign out
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              {isSubmitting ? 'Saving...' : 'Set Password & Continue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

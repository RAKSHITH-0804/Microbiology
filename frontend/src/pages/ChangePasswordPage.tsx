import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { KeyRound, Loader2, LogOut, Microscope, ShieldCheck } from 'lucide-react';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { fieldErrors } from '@/features/admin/api';
import { changePassword } from '@/features/settings/api';
import { EMPTY_PASSWORDS, passwordSchema, type PasswordValues } from '@/features/settings/passwordSchema';
import { CHANGE_PASSWORD_PATH } from '@/layout/navigation';
import { getErrorMessage } from '@/lib/api';

/** Compulsory first-login screen: nothing else opens until the initial or temporary password is replaced. */
export default function ChangePasswordPage() {
  const { user, logout, markPasswordChanged } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
  const next = from && from !== CHANGE_PASSWORD_PATH ? from : '/';

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: EMPTY_PASSWORDS });

  // Also taken once the password is changed: markPasswordChanged() lifts the flag and this sends the user on.
  if (!user?.mustChangePassword) return <Navigate to={next} replace />;

  const onSubmit = async (v: PasswordValues) => {
    try {
      await changePassword(v.currentPassword, v.newPassword);
      toast.success('Password changed successfully', { description: 'Welcome! You now have full access to the portal.' });
      markPasswordChanged();
    } catch (err) {
      for (const [key, message] of Object.entries(fieldErrors(err))) {
        if (key in EMPTY_PASSWORDS) setError(key as keyof PasswordValues, { type: 'server', message });
      }
      toast.error(getErrorMessage(err, 'Could not change the password'));
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-100 p-4 sm:p-6">
      <div className="w-full max-w-md motion-safe:animate-fade-up">
        <div className="mb-5 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-md shadow-blue-600/30">
            <Microscope className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">JJMMC Microbiology</p>
            <p className="text-xs text-slate-500">Department of Microbiology</p>
          </div>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5 rounded-2xl border border-slate-200/60 bg-white p-6 shadow-xl sm:p-8"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Set Your Password</h1>
              <p className="mt-1 text-sm text-slate-500">
                Welcome, {user.name}. You are signed in with an initial or temporary password. Choose your own password to
                continue to the portal.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <FormField label="Current (Temporary) Password" htmlFor="currentPassword" required error={errors.currentPassword?.message}>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                autoFocus
                aria-invalid={!!errors.currentPassword}
                {...register('currentPassword')}
              />
            </FormField>
            <FormField
              label="New Password"
              htmlFor="newPassword"
              required
              error={errors.newPassword?.message}
              hint="At least 6 characters. Do not share it with anyone."
            >
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.newPassword}
                {...register('newPassword')}
              />
            </FormField>
            <FormField label="Confirm New Password" htmlFor="confirmPassword" required error={errors.confirmPassword?.message}>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                {...register('confirmPassword')}
              />
            </FormField>
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <Button type="button" variant="ghost" onClick={signOut} disabled={isSubmitting}>
              <LogOut /> Sign out
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              {isSubmitting ? 'Saving...' : 'Set Password & Continue'}
            </Button>
          </div>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">Department of Microbiology — J.J.M. Medical College, Davangere</p>
      </div>
    </div>
  );
}

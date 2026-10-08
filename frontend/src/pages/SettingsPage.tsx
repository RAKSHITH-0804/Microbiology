import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { KeyRound, Loader2, Printer, RotateCcw, ShieldCheck, UserRound } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormField } from '@/components/FormField';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { fieldErrors } from '@/features/admin/api';
import { changePassword, fetchSession } from '@/features/settings/api';
import { EMPTY_PASSWORDS, passwordSchema, type PasswordValues } from '@/features/settings/passwordSchema';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABELS, type UserRole } from '@/types/auth';
import type { SessionInfo } from '@/types/settings';

const ROLE_TONE: Record<UserRole, BadgeProps['tone']> = { HOD: 'violet', DOCTOR: 'blue', LAB_TECH: 'emerald' };

type TabKey = 'security' | 'print';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function ToggleRow({
  id,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab 1: Security & Profile                                           */
/* ------------------------------------------------------------------ */

function ProfileCard({ session, loading }: { session: SessionInfo | null; loading: boolean }) {
  const { user } = useAuth();
  if (!user) return null;
  const initials = user.name
    .replace(/^(dr|mr|mrs|ms)\.?\s*/i, '')
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-primary" /> Profile
        </CardTitle>
        <CardDescription>Your account details. Ask the HOD to correct your name or designation.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-5 flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold text-white">
            {initials || user.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-slate-900">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.designation ?? ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <InfoItem label="Username">
            <span className="font-mono">{user.username}</span>
          </InfoItem>
          <InfoItem label="Role">
            <Badge tone={ROLE_TONE[user.role]}>{user.role}</Badge>
            <span className="ml-2 text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
          </InfoItem>
          <InfoItem label="Last Login">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : session?.previousLoginAt ? (
              formatDateTime(session.previousLoginAt)
            ) : (
              <span className="text-muted-foreground">First sign-in</span>
            )}
          </InfoItem>
          <InfoItem label="Current Session Since">
            {session?.currentLoginAt ? formatDateTime(session.currentLoginAt) : '-'}
          </InfoItem>
          <InfoItem label="Password Last Changed">
            {session?.passwordChangedAt ? formatDateTime(session.passwordChangedAt) : <span className="text-amber-700">Never changed</span>}
          </InfoItem>
        </dl>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard({ onChanged }: { onChanged: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: EMPTY_PASSWORDS });

  const onSubmit = async (v: PasswordValues) => {
    try {
      await changePassword(v.currentPassword, v.newPassword);
      toast.success('Password changed successfully', { description: 'Other devices signed in to your account were signed out.' });
      reset(EMPTY_PASSWORDS);
      onChanged();
    } catch (err) {
      for (const [key, message] of Object.entries(fieldErrors(err))) {
        if (key in EMPTY_PASSWORDS) setError(key as keyof PasswordValues, { type: 'server', message });
      }
      toast.error(getErrorMessage(err, 'Could not change the password'));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" /> Change Password
        </CardTitle>
        <CardDescription>Use at least 6 characters. Changing it signs you out on every other computer.</CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Current Password" htmlFor="currentPassword" required error={errors.currentPassword?.message}>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.currentPassword}
              {...register('currentPassword')}
            />
          </FormField>
          <FormField label="New Password" htmlFor="newPassword" required error={errors.newPassword?.message}>
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
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              {isSubmitting ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SecurityTab() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      setSession(await fetchSession());
    } catch {
      // The profile still shows the details from the login; only the timestamps are missing.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ProfileCard session={session} loading={loading} />
      <ChangePasswordCard onChanged={loadSession} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab 2: Report & Print Preferences                                   */
/* ------------------------------------------------------------------ */

function PrintTab() {
  const { printPrefs, setPrintPref, resetPrintPrefs, settings } = useSettings();
  const isDefault = printPrefs.show_end_of_report === settings.print_defaults.show_end_of_report;

  return (
    <Card className="max-w-3xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-4 w-4 text-primary" /> Report &amp; Print Preferences
        </CardTitle>
        <CardDescription>
          Saved on this computer for your account and applied immediately. Reports can be printed only after the assigned doctor
          has verified them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          <ToggleRow
            id="end-of-report"
            title={'Include "End of Report" footer line on printouts'}
            description='Prints "*** End of Report ***" below the findings, above the signatures.'
            checked={printPrefs.show_end_of_report}
            onChange={(v) => setPrintPref('show_end_of_report', v)}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {isDefault ? 'Using the department defaults.' : 'You have changed the department defaults on this computer.'}
          </p>
          <Button variant="outline" size="sm" onClick={resetPrintPrefs} disabled={isDefault}>
            <RotateCcw /> Use department defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabKey = params.get('tab') === 'print' ? 'print' : 'security';

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-primary">Account</p>
        <h2 className="text-xl font-semibold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your profile, password and print preferences.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams(v === 'security' ? {} : { tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="security">
            <ShieldCheck className="h-4 w-4" /> Security &amp; Profile
          </TabsTrigger>
          <TabsTrigger value="print">
            <Printer className="h-4 w-4" /> Report &amp; Print Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="print">
          <PrintTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertTriangle, Inbox, Loader2, RefreshCw, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormField } from '@/components/FormField';
import { useAuth } from '@/context/AuthContext';
import { createUser, deleteUser, fetchUsers, fieldErrors, setUserActive } from '@/features/admin/api';
import { fetchStaff } from '@/features/reports/api';
import { getErrorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import type { AppUser, StaffType } from '@/types/admin';
import { ROLE_LABELS, type UserRole } from '@/types/auth';
import type { MasterStaff } from '@/types/report';

const ROLES: UserRole[] = ['HOD', 'DOCTOR', 'LAB_TECH'];
const ROLE_TONE: Record<UserRole, BadgeProps['tone']> = { HOD: 'violet', DOCTOR: 'blue', LAB_TECH: 'emerald' };

type StaffMode = 'existing' | 'new';

const userSchema = z
  .object({
    mode: z.enum(['existing', 'new']),
    staff_id: z.string(),
    staff_type: z.string(),
    name: z.string().trim().max(150, 'Staff name must be at most 150 characters'),
    designation: z.string().trim().max(150, 'Designation must be at most 150 characters'),
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(50, 'Username must be at most 50 characters')
      .regex(/^[A-Za-z0-9._-]+$/, 'Use only letters, numbers, dot, dash or underscore'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
    confirm_password: z.string(),
    role: z.string().refine((v) => (ROLES as string[]).includes(v), 'Select a role'),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirm_password) {
      ctx.addIssue({ code: 'custom', path: ['confirm_password'], message: 'Passwords do not match' });
    }
    if (v.mode === 'existing') {
      if (!v.staff_id) ctx.addIssue({ code: 'custom', path: ['staff_id'], message: 'Select the staff member' });
      return;
    }
    if (v.staff_type !== 'TEACHING' && v.staff_type !== 'NON_TEACHING') {
      ctx.addIssue({ code: 'custom', path: ['staff_type'], message: 'Select the staff category' });
    }
    if (v.name.length < 2) ctx.addIssue({ code: 'custom', path: ['name'], message: 'Enter the staff name' });
    if (v.designation.length < 2) ctx.addIssue({ code: 'custom', path: ['designation'], message: 'Enter the designation' });
  });
type UserFormValues = z.infer<typeof userSchema>;

const EMPTY: UserFormValues = {
  mode: 'existing',
  staff_id: '',
  staff_type: '',
  name: '',
  designation: '',
  username: '',
  password: '',
  confirm_password: '',
  role: '',
};

/** Same convention as the seeded accounts: "Dr.Sunita.B.R" -> "dr.sunita", "Mr.Lokesh.A.G." -> "lokesh". */
function suggestUsername(name: string, staffType: string): string {
  const first = name
    .replace(/^\s*(mrs|miss|mr|ms|dr)\b\.?\s*/i, '')
    .split(/[\s.]+/)
    .find(Boolean)
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!first) return '';
  return staffType === 'TEACHING' || /^\s*dr\b/i.test(name) ? `dr.${first}` : first;
}

function CreateUserDialog({
  open,
  onOpenChange,
  staff,
  users,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: MasterStaff[];
  users: AppUser[];
  onCreated: (user: AppUser) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    getFieldState,
    setError,
    clearErrors,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({ resolver: zodResolver(userSchema), defaultValues: EMPTY });

  const unlinked = useMemo(() => {
    const linked = new Set(users.map((u) => u.staff_id).filter((id): id is number => id !== null));
    return staff.filter((s) => !linked.has(s.id));
  }, [staff, users]);
  const designations = useMemo(() => [...new Set(staff.map((s) => s.designation))].sort(), [staff]);

  useEffect(() => {
    if (open) reset({ ...EMPTY, mode: unlinked.length ? 'existing' : 'new' });
    // Only when the dialog opens; the staff list refreshing in the background must not wipe input.
  }, [open, reset]);

  const mode = watch('mode');
  const canSubmit = mode === 'new' || unlinked.length > 0;

  const switchMode = (next: string) => {
    setValue('mode', next as StaffMode);
    clearErrors();
  };

  /** Fill username / role from the staff details unless the user already typed their own. */
  const suggest = (name: string, staffType: string, role: string | undefined) => {
    if (!getFieldState('username').isDirty) setValue('username', suggestUsername(name, staffType));
    if (role && !getFieldState('role').isDirty) setValue('role', role);
  };

  const staffField = register('staff_id', {
    onChange: (e: { target: { value: string } }) => {
      const member = unlinked.find((s) => String(s.id) === e.target.value);
      if (member) suggest(member.name, member.staff_type, member.staff_role !== 'OTHER' ? member.staff_role : undefined);
    },
  });
  const staffTypeField = register('staff_type', {
    onChange: (e: { target: { value: string } }) => {
      const type = e.target.value;
      suggest(getValues('name'), type, type === 'TEACHING' ? 'DOCTOR' : type === 'NON_TEACHING' ? 'LAB_TECH' : undefined);
    },
  });
  const nameField = register('name', {
    onChange: (e: { target: { value: string } }) => suggest(e.target.value, getValues('staff_type'), undefined),
  });

  const onSubmit = async (v: UserFormValues) => {
    const base = { username: v.username.trim(), password: v.password, role: v.role as UserRole };
    try {
      const user = await createUser(
        v.mode === 'existing'
          ? { ...base, staff_id: Number(v.staff_id) }
          : { ...base, staff_type: v.staff_type as StaffType, name: v.name.trim(), designation: v.designation.trim() },
      );
      toast.success(v.mode === 'new' ? 'New staff account created successfully' : `User ${user.username} created`);
      onCreated(user);
      onOpenChange(false);
    } catch (err) {
      for (const [key, message] of Object.entries(fieldErrors(err))) {
        if (key in EMPTY) setError(key as keyof UserFormValues, { type: 'server', message });
      }
      toast.error(getErrorMessage(err, 'Could not create the user'));
    }
  };

  const teaching = unlinked.filter((s) => s.staff_type === 'TEACHING');
  const nonTeaching = unlinked.filter((s) => s.staff_type !== 'TEACHING');

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent>
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>Create User Account</DialogTitle>
            <DialogDescription>Link the login to a staff member so reports and verifications carry their name.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Tabs value={mode} onValueChange={switchMode}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing" disabled={isSubmitting}>
                  <Users className="h-4 w-4" /> Existing Staff
                  <span className="rounded bg-slate-200 px-1.5 text-xs text-slate-600">{unlinked.length}</span>
                </TabsTrigger>
                <TabsTrigger value="new" disabled={isSubmitting}>
                  <UserPlus className="h-4 w-4" /> Newly Joined Staff
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === 'existing' ? (
              unlinked.length === 0 ? (
                <div className="rounded-md border border-dashed bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">
                  Every staff member already has an account.
                  <br />
                  Use <strong className="text-slate-700">Newly Joined Staff</strong> to register someone new.
                </div>
              ) : (
                <FormField
                  label="Staff Member"
                  htmlFor="staff_id"
                  required
                  error={errors.staff_id?.message}
                  hint="Only staff without a login are listed"
                >
                  <NativeSelect id="staff_id" aria-invalid={!!errors.staff_id} {...staffField}>
                    <option value="">Select staff member</option>
                    {teaching.length > 0 && (
                      <optgroup label="Teaching staff">
                        {teaching.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} - {s.designation}</option>
                        ))}
                      </optgroup>
                    )}
                    {nonTeaching.length > 0 && (
                      <optgroup label="Non-teaching staff">
                        {nonTeaching.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} - {s.designation}</option>
                        ))}
                      </optgroup>
                    )}
                  </NativeSelect>
                </FormField>
              )
            ) : (
              <>
                <FormField label="Staff Category" htmlFor="staff_type" required error={errors.staff_type?.message}>
                  <NativeSelect id="staff_type" aria-invalid={!!errors.staff_type} {...staffTypeField}>
                    <option value="">Select category</option>
                    <option value="TEACHING">Teaching</option>
                    <option value="NON_TEACHING">Non-teaching</option>
                  </NativeSelect>
                </FormField>
                <FormField label="Staff Name" htmlFor="name" required error={errors.name?.message} hint="As it should appear on reports">
                  <Input id="name" placeholder="e.g. Dr. Ramesh H." autoComplete="off" aria-invalid={!!errors.name} {...nameField} />
                </FormField>
                <FormField label="Designation" htmlFor="designation" required error={errors.designation?.message}>
                  <Input
                    id="designation"
                    list="designation-options"
                    placeholder="e.g. Assistant Professor or Jr. Lab Tech"
                    autoComplete="off"
                    aria-invalid={!!errors.designation}
                    {...register('designation')}
                  />
                  <datalist id="designation-options">
                    {designations.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </FormField>
              </>
            )}

            {canSubmit && (
              <>
                <FormField label="Role" htmlFor="role" required error={errors.role?.message} hint="Controls which screens and actions are available">
                  <NativeSelect id="role" aria-invalid={!!errors.role} {...register('role')}>
                    <option value="">Select role</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]} ({r})</option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="Username" htmlFor="username" required error={errors.username?.message}>
                  <Input id="username" autoComplete="off" aria-invalid={!!errors.username} {...register('username')} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Password" htmlFor="password" required error={errors.password?.message}>
                    <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
                  </FormField>
                  <FormField label="Confirm Password" htmlFor="confirm_password" required error={errors.confirm_password?.message}>
                    <Input
                      id="confirm_password"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={!!errors.confirm_password}
                      {...register('confirm_password')}
                    />
                  </FormField>
                </div>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !canSubmit}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
              {isSubmitting ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: AppUser | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      const { message, staffDeleted } = await deleteUser(target.id);
      toast.success(message, {
        description: staffDeleted && target.staff_name ? `${target.staff_name} was also removed from the staff list.` : undefined,
      });
      onDeleted();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the user account'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && !deleting && onClose()}>
      <DialogContent className="max-w-md">
        {target && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                Delete User Account?
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete user &apos;<span className="font-mono font-semibold text-slate-900">{target.username}</span>&apos;
                {target.staff_name && <> ({target.staff_name})</>}? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {target.staff_name && (
              <DialogBody>
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  The staff record <span className="font-semibold">{target.staff_name}</span> will also be removed from the staff list,
                  as no other account or report uses it.
                </p>
              </DialogBody>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={deleting}>
                Cancel
              </Button>
              <Button className="bg-red-600 text-white hover:bg-red-700" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                {deleting ? 'Deleting...' : 'Delete Account'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [staff, setStaff] = useState<MasterStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<AppUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, s] = await Promise.all([fetchUsers(), fetchStaff()]);
      setUsers(u);
      setStaff(s);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load users'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      term
        ? users.filter((u) => [u.username, u.staff_name, u.designation, u.role].some((v) => v?.toLowerCase().includes(term)))
        : users,
    [users, term],
  );
  const activeCount = users.filter((u) => u.is_active).length;

  const toggle = async (target: AppUser, isActive: boolean) => {
    setToggling(target.id);
    try {
      const updated = await setUserActive(target.id, isActive);
      setUsers((current) => current.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(`${updated.username} ${isActive ? 'activated' : 'deactivated'}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not change the account status'));
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Administration</p>
          <h2 className="text-xl font-semibold text-foreground">User Management</h2>
          <p className="text-sm text-muted-foreground">
            {users.length} account(s) - {activeCount} active, {users.length - activeCount} disabled
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users" className="w-56 pl-8" />
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} /> Refresh
          </Button>
          <Button onClick={() => setCreating(true)} disabled={loading && staff.length === 0}>
            <UserPlus /> New User
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>User Accounts</CardTitle>
          <CardDescription>Disabling an account blocks its login immediately, including sessions already open.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="mx-6 mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
              <Button size="sm" variant="outline" onClick={load}>Retry</Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-y bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Username</th>
                  <th className="px-4 py-2.5">Linked Staff</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Last Login</th>
                  <th className="px-4 py-2.5">Created</th>
                  <th className="px-4 py-2.5 text-right">Active / Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading users...
                    </td>
                  </tr>
                )}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      No users match your search.
                    </td>
                  </tr>
                )}
                {visible.map((u) => {
                  const isMe = u.id === me?.id;
                  const deleteBlockedReason = isMe
                    ? 'You cannot delete your own account'
                    : u.has_clinical_records
                      ? 'Has clinical records - disable the account instead'
                      : null;
                  return (
                    <tr key={u.id} className={u.is_active ? 'hover:bg-slate-50/70' : 'bg-slate-50/60 text-slate-500'}>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-slate-900">{u.username}</span>
                        {isMe && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                        {!u.is_active && <Badge tone="red" className="ml-2">Disabled</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{u.staff_name || '-'}</p>
                        {u.designation && <p className="text-xs text-slate-500">{u.designation}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={ROLE_TONE[u.role]} title={ROLE_LABELS[u.role]}>{u.role}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {toggling === u.id && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                          <Switch
                            checked={u.is_active}
                            disabled={isMe || toggling === u.id}
                            onCheckedChange={(checked) => toggle(u, checked)}
                            aria-label={`${u.is_active ? 'Deactivate' : 'Activate'} ${u.username}`}
                            title={isMe ? 'You cannot deactivate your own account' : undefined}
                          />
                          <span title={deleteBlockedReason ?? `Delete ${u.username}`}>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              disabled={!!deleteBlockedReason}
                              onClick={() => setDeleting(u)}
                              aria-label={`Delete user ${u.username}`}
                            >
                              <Trash2 />
                            </Button>
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <CreateUserDialog
        open={creating}
        onOpenChange={setCreating}
        staff={staff}
        users={users}
        onCreated={load}
      />

      <DeleteUserDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          load();
        }}
      />
    </div>
  );
}

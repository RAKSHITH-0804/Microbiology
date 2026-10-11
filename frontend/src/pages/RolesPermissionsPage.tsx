import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Ban, CheckCheck, Inbox, KeyRound, Loader2, Lock, RefreshCw, Search, ShieldAlert, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { RoleBadge } from '@/components/RoleBadge';
import {
  fetchPermissionMatrix,
  setAllPermissions,
  setAllPermissionsForEveryone,
  updatePermission,
  type PermissionUser,
} from '@/features/admin/permissions';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { MODULE_KEYS, MODULE_LABELS, ROLE_LABELS, type ModuleKey, type UserRole } from '@/types/auth';

const STAFF_CATEGORY: Record<string, string> = { TEACHING: 'Teaching', NON_TEACHING: 'Non-Teaching' };
const ROLE_FILTERS: UserRole[] = ['SUPER_ADMIN', 'HOD', 'DOCTOR', 'LAB_TECH', 'CLERK'];

const cellKey = (userId: number, module: ModuleKey) => `${userId}:${module}`;
const rowKey = (userId: number) => `${userId}:*`;

function ModuleCell({
  user,
  module,
  saving,
  onToggle,
}: {
  user: PermissionUser;
  module: ModuleKey;
  saving: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const state = user.permissions[module];
  const label = `${MODULE_LABELS[module]} for ${user.name}`;

  if (!state.allowed) {
    return state.enabled ? (
      <span title="Super Admin access cannot be restricted" className="inline-flex items-center gap-1 text-emerald-600">
        <Lock className="h-3.5 w-3.5" aria-label={`${label}: always on`} />
      </span>
    ) : (
      <span
        title="The Super Admin account has no staff signature; reports are verified by doctors"
        className="inline-flex items-center gap-1 text-slate-300"
      >
        <Lock className="h-3.5 w-3.5" aria-label={`${label}: not applicable`} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Switch checked={state.enabled} disabled={saving} onCheckedChange={onToggle} aria-label={label} />
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
    </span>
  );
}

function GrantEveryoneDialog({
  open,
  count,
  saving,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  count: number;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <ShieldAlert className="h-5 w-5" />
            </span>
            Grant all modules to everyone?
          </DialogTitle>
          <DialogDescription>
            Every one of the {count} active staff account(s) will be able to open all {MODULE_KEYS.length} modules.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This includes Users, Master Data and Audit Logs, so every account will be able to create and disable
            staff logins, reset their passwords, edit master lists and read the full audit trail. Super Admin
            accounts and this permission matrix stay with the Super Admin.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <CheckCheck />} Grant All to Everyone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RolesPermissionsPage() {
  const [users, setUsers] = useState<PermissionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [confirmEveryone, setConfirmEveryone] = useState(false);
  const [grantingEveryone, setGrantingEveryone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers((await fetchPermissionMatrix()).users);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load the permission matrix'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markSaving = (key: string, on: boolean) =>
    setSaving((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  /** Updates one cell only, so overlapping toggles on the same row don't overwrite each other. */
  const setCell = (userId: number, module: ModuleKey, enabled: boolean) =>
    setUsers((list) =>
      list.map((u) =>
        u.id === userId ? { ...u, permissions: { ...u.permissions, [module]: { ...u.permissions[module], enabled } } } : u,
      ),
    );

  const replaceUser = (updated: PermissionUser) => setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));

  const toggle = async (user: PermissionUser, module: ModuleKey, enabled: boolean) => {
    const key = cellKey(user.id, module);
    markSaving(key, true);
    setCell(user.id, module, enabled);
    try {
      const saved = await updatePermission(user.id, module, enabled);
      setCell(user.id, module, saved.permissions[module].enabled);
      toast.success(`${MODULE_LABELS[module]} ${enabled ? 'enabled' : 'disabled'} for ${user.name}`, { id: key });
    } catch (err) {
      setCell(user.id, module, !enabled);
      toast.error(getErrorMessage(err, 'Could not update the permission'), { id: key });
    } finally {
      markSaving(key, false);
    }
  };

  const setRow = async (user: PermissionUser, enabled: boolean) => {
    const key = rowKey(user.id);
    markSaving(key, true);
    try {
      const { user: saved, message } = await setAllPermissions(user.id, enabled);
      replaceUser(saved);
      toast.success(message, { id: key });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update the permissions'), { id: key });
    } finally {
      markSaving(key, false);
    }
  };

  const grantEveryone = async () => {
    setGrantingEveryone(true);
    try {
      const { matrix, message } = await setAllPermissionsForEveryone(true);
      setUsers(matrix.users);
      setConfirmEveryone(false);
      toast.success(message);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not grant access to everyone'));
    } finally {
      setGrantingEveryone(false);
    }
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        (!roleFilter || u.role === roleFilter) &&
        (!term || [u.name, u.username, u.designation ?? ''].some((v) => v.toLowerCase().includes(term))),
    );
  }, [users, search, roleFilter]);

  const staffAccounts = users.filter((u) => u.restrictable);
  const everyoneHasAll = staffAccounts.every((u) => MODULE_KEYS.every((m) => u.permissions[m].enabled));
  const { granted, revoked } = staffAccounts.reduce(
    (acc, u) => {
      for (const m of MODULE_KEYS) {
        const p = u.permissions[m];
        if (p.enabled && !p.role_default) acc.granted += 1;
        if (!p.enabled && p.role_default) acc.revoked += 1;
      }
      return acc;
    },
    { granted: 0, revoked: 0 },
  );

  return (
    <div className="mx-auto max-w-[96rem] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Administration</p>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <KeyRound className="h-5 w-5 text-primary" /> Roles &amp; Permissions
          </h2>
          <p className="text-sm text-muted-foreground">
            Switch any module on or off for any staff account. Each role starts from its default set; switches override it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff" className="w-52 pl-8" />
          </div>
          <NativeSelect
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}
            className="w-44"
          >
            <option value="">All roles</option>
            {ROLE_FILTERS.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </NativeSelect>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
          <div className="space-y-1.5">
            <CardTitle>Permission Matrix</CardTitle>
            <CardDescription>
              Changes apply immediately: the user gains or loses the sidebar link and the matching API access.
              {granted > 0 && ` ${granted} extra module grant(s).`}
              {revoked > 0 && ` ${revoked} default module(s) switched off.`}
            </CardDescription>
          </div>
          <Button
            onClick={() => setConfirmEveryone(true)}
            disabled={loading || grantingEveryone || staffAccounts.length === 0 || everyoneHasAll}
            title={everyoneHasAll ? 'Every staff account already has every module' : undefined}
          >
            <CheckCheck /> Grant All to Everyone
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="mx-6 mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
              <Button size="sm" variant="outline" onClick={load}>Retry</Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] text-sm">
              <thead>
                <tr className="border-y bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 min-w-[15rem] bg-slate-50 px-4 py-2.5">User Name</th>
                  <th className="px-3 py-2.5">Staff Category</th>
                  <th className="px-3 py-2.5">Role</th>
                  {MODULE_KEYS.map((m) => (
                    <th key={m} className="w-[6.5rem] px-2 py-2.5 text-center leading-tight">{MODULE_LABELS[m]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && users.length === 0 && (
                  <tr>
                    <td colSpan={3 + MODULE_KEYS.length} className="px-4 py-10 text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading permissions...
                    </td>
                  </tr>
                )}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td colSpan={3 + MODULE_KEYS.length} className="px-4 py-12 text-center text-muted-foreground">
                      <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      No active users match the filters.
                    </td>
                  </tr>
                )}
                {visible.map((u) => {
                  const rowSaving = saving.has(rowKey(u.id)) || grantingEveryone;
                  const allOn = MODULE_KEYS.every((m) => u.permissions[m].enabled);
                  const allOff = MODULE_KEYS.every((m) => !u.permissions[m].enabled);
                  return (
                    <tr key={u.id} className="group hover:bg-slate-50/70">
                      <td className="sticky left-0 z-10 bg-card px-4 py-3 group-hover:bg-slate-50">
                        <p className="font-medium text-slate-900">{u.name}</p>
                        <p className="text-xs text-slate-500">
                          <span className="font-mono">{u.username}</span>
                          {u.designation && ` - ${u.designation}`}
                        </p>
                        {u.restrictable && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-emerald-700 hover:text-emerald-800"
                              disabled={rowSaving || allOn}
                              onClick={() => setRow(u, true)}
                              title={`Enable all ${MODULE_KEYS.length} modules for ${u.name}`}
                            >
                              {rowSaving ? <Loader2 className="animate-spin" /> : <CheckCheck />} Grant All
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-red-600 hover:text-red-700"
                              disabled={rowSaving || allOff}
                              onClick={() => setRow(u, false)}
                              title={`Disable every module for ${u.name}`}
                            >
                              <Ban /> Revoke All
                            </Button>
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                        {u.staff_type ? STAFF_CATEGORY[u.staff_type] : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-3 py-3">
                        <RoleBadge role={u.role} />
                      </td>
                      {MODULE_KEYS.map((m) => {
                        const p = u.permissions[m];
                        return (
                          <td
                            key={m}
                            className={cn(
                              'px-2 py-3 text-center',
                              p.allowed && p.enabled && !p.role_default && 'bg-violet-50/70',
                              p.allowed && !p.enabled && p.role_default && 'bg-red-50/60',
                            )}
                          >
                            <ModuleCell
                              user={u}
                              module={m}
                              saving={rowSaving || saving.has(cellKey(u.id, m))}
                              onToggle={(enabled) => toggle(u, m, enabled)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-violet-100 ring-1 ring-violet-200" />
              <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Granted beyond the role&apos;s defaults
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-red-100 ring-1 ring-red-200" /> Default module switched off
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-emerald-600" /> Super Admin - always on
            </span>
            <span>Role-specific rules still apply inside a module, e.g. doctors see only the reports assigned to them.</span>
          </div>
        </CardContent>
      </Card>

      <GrantEveryoneDialog
        open={confirmEveryone}
        count={staffAccounts.length}
        saving={grantingEveryone}
        onOpenChange={setConfirmEveryone}
        onConfirm={grantEveryone}
      />
    </div>
  );
}

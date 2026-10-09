import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Inbox, KeyRound, Loader2, Lock, Minus, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { RoleBadge } from '@/components/RoleBadge';
import { fetchPermissionMatrix, updatePermission, type PermissionUser } from '@/features/admin/permissions';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { MODULE_KEYS, MODULE_LABELS, ROLE_LABELS, type ModuleKey, type UserRole } from '@/types/auth';

const STAFF_CATEGORY: Record<string, string> = { TEACHING: 'Teaching', NON_TEACHING: 'Non-Teaching' };
const ROLE_FILTERS: UserRole[] = ['SUPER_ADMIN', 'HOD', 'DOCTOR', 'LAB_TECH', 'CLERK'];

const cellKey = (userId: number, module: ModuleKey) => `${userId}:${module}`;

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
    return (
      <span title={`Not available to the ${ROLE_LABELS[user.role]} role`} className="inline-flex text-slate-300">
        <Minus className="h-4 w-4" aria-label={`${label}: not available`} />
      </span>
    );
  }
  if (!user.restrictable) {
    return (
      <span title="Super Admin access cannot be restricted" className="inline-flex items-center gap-1 text-emerald-600">
        <Lock className="h-3.5 w-3.5" aria-label={`${label}: always on`} />
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

export default function RolesPermissionsPage() {
  const [users, setUsers] = useState<PermissionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');

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

  /** Updates one cell only, so overlapping toggles on the same row don't overwrite each other. */
  const setCell = (userId: number, module: ModuleKey, enabled: boolean) =>
    setUsers((list) =>
      list.map((u) =>
        u.id === userId ? { ...u, permissions: { ...u.permissions, [module]: { ...u.permissions[module], enabled } } } : u,
      ),
    );

  const toggle = async (user: PermissionUser, module: ModuleKey, enabled: boolean) => {
    const key = cellKey(user.id, module);
    setSaving((s) => new Set(s).add(key));
    setCell(user.id, module, enabled);
    try {
      const saved = await updatePermission(user.id, module, enabled);
      setCell(user.id, module, saved.permissions[module].enabled);
      toast.success(`${MODULE_LABELS[module]} ${enabled ? 'enabled' : 'disabled'} for ${user.name}`, { id: key });
    } catch (err) {
      setCell(user.id, module, !enabled);
      toast.error(getErrorMessage(err, 'Could not update the permission'), { id: key });
    } finally {
      setSaving((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
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

  const disabledCount = users.reduce(
    (n, u) => n + MODULE_KEYS.filter((m) => u.permissions[m].allowed && !u.permissions[m].enabled).length,
    0,
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
            Switch individual modules off for an account. A role&apos;s own limits always apply; switches only narrow them.
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
        <CardHeader className="pb-3">
          <CardTitle>Permission Matrix</CardTitle>
          <CardDescription>
            Changes apply immediately: the user loses the sidebar link and the API answers 403 for that module.
            {disabledCount > 0 && ` ${disabledCount} module switch(es) currently off.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="mx-6 mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
              <Button size="sm" variant="outline" onClick={load}>Retry</Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-sm">
              <thead>
                <tr className="border-y bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5">User Name</th>
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
                {visible.map((u) => (
                  <tr key={u.id} className="group hover:bg-slate-50/70">
                    <td className="sticky left-0 z-10 bg-card px-4 py-3 group-hover:bg-slate-50">
                      <p className="font-medium text-slate-900">{u.name}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{u.username}</span>
                        {u.designation && ` - ${u.designation}`}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                      {u.staff_type ? STAFF_CATEGORY[u.staff_type] : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-3 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    {MODULE_KEYS.map((m) => (
                      <td
                        key={m}
                        className={cn(
                          'px-2 py-3 text-center',
                          u.permissions[m].allowed && !u.permissions[m].enabled && 'bg-red-50/60',
                        )}
                      >
                        <ModuleCell
                          user={u}
                          module={m}
                          saving={saving.has(cellKey(u.id, m))}
                          onToggle={(enabled) => toggle(u, m, enabled)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Minus className="h-3.5 w-3.5 text-slate-300" /> Not part of the role
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-emerald-600" /> Super Admin - always on
            </span>
            <span>Master Data, Users and Audit Logs belong to the Super Admin role only.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/DatePicker';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { fetchAuditLogs } from '@/features/admin/api';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AuditLogEntry, AuditLogPage } from '@/types/admin';

const PAGE_SIZE = 25;

const ACTION_TONE: Record<string, BadgeProps['tone']> = {
  LOGIN: 'slate',
  LOGOUT: 'slate',
  CREATE: 'blue',
  UPDATE: 'amber',
  VERIFY: 'emerald',
  ACTIVATE: 'emerald',
  RESTORE: 'emerald',
  DEACTIVATE: 'red',
  DELETE: 'red',
};

const ENTITY_LABEL: Record<string, string> = {
  users: 'User account',
  requisitions: 'Requisition',
  general_reports: 'General report',
  antibiogram_reports: 'Antibiogram report',
  master_organisms: 'Organism',
  master_antibiotics: 'Antibiotic',
  master_samples: 'Sample type',
  master_test_templates: 'Finding template',
  master_staff: 'Staff member',
};

const entityLabel = (name: string) => ENTITY_LABEL[name] ?? name;

/** One-line, human-readable summary of an audit entry. */
function describe(e: AuditLogEntry): string {
  const d = (e.details ?? {}) as Record<string, unknown>;
  const lab = typeof d.lab_no === 'string' ? ` ${d.lab_no}` : '';
  switch (`${e.action}:${e.entity_name}`) {
    case 'LOGIN:users':
      return 'Signed in';
    case 'LOGOUT:users':
      return 'Signed out';
    case 'CREATE:users':
      return `Created user account "${String(d.username ?? '')}" (${String(d.role ?? '')})`;
    case 'ACTIVATE:users':
    case 'DEACTIVATE:users':
      return `${e.action === 'ACTIVATE' ? 'Activated' : 'Deactivated'} user account "${String(d.username ?? '')}"`;
    case 'DELETE:users': {
      const staff = typeof d.staff_name === 'string' ? ` (${d.staff_name})` : '';
      return `Deleted user account "${String(d.username ?? '')}"${staff}${d.staff_deleted ? ' and its staff record' : ''}`;
    }
    case 'CREATE:requisitions':
      return `Registered requisition${lab}`;
    case 'UPDATE:requisitions': {
      const changed = Object.keys((d.changes as object) ?? {});
      const tests = ((d.tests_added as unknown[])?.length ?? 0) + ((d.tests_removed as unknown[])?.length ?? 0);
      const parts = [...changed.map((c) => c.replace(/_/g, ' ')), ...(tests ? ['tests'] : [])];
      return `Edited requisition${lab}${parts.length ? ` - ${parts.join(', ')}` : ''}`;
    }
    case 'VERIFY:general_reports':
    case 'VERIFY:antibiogram_reports':
      return `Verified ${entityLabel(e.entity_name).toLowerCase()} for${lab}`;
    default: {
      const verb = { CREATE: 'Added', UPDATE: 'Updated', DEACTIVATE: 'Deactivated', RESTORE: 'Restored' }[e.action] ?? e.action;
      const name = d.organism_name ?? d.antibiotic_name ?? d.sample_name ?? d.finding_text ?? d.username ?? d.name;
      const target = entityLabel(e.entity_name).toLowerCase();
      if (e.entity_name.endsWith('_reports')) return `${verb === 'Added' ? 'Entered' : verb} ${target} for${lab}`;
      return `${verb} ${target}${typeof name === 'string' ? ` "${name.length > 50 ? `${name.slice(0, 50)}...` : name}"` : ''}`;
    }
  }
}

/** Start or end of a local calendar day as an ISO timestamp. */
const dayBoundary = (date: string, end: boolean) => (date ? new Date(`${date}T${end ? '23:59:59.999' : '00:00:00'}`).toISOString() : undefined);

export default function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditLogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => setPage(1), [debouncedSearch, action, entity, fromDate, toDate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await fetchAuditLogs({
          search: debouncedSearch || undefined,
          action: action || undefined,
          entity: entity || undefined,
          from: dayBoundary(fromDate, false),
          to: dayBoundary(toDate, true),
          page,
          page_size: PAGE_SIZE,
        }),
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load audit logs'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, action, entity, fromDate, toDate, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const hasFilters = !!(search || action || entity || fromDate || toDate);
  const clearFilters = () => {
    setSearch('');
    setAction('');
    setEntity('');
    setFromDate('');
    setToDate('');
  };
  const today = new Date().toLocaleDateString('en-CA');

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Administration</p>
          <h2 className="text-xl font-semibold text-foreground">System Audit Logs</h2>
          <p className="text-sm text-muted-foreground">
            Sign-ins, requisition entries and edits, reports, verifications and master data changes.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid gap-3 border-b px-4 py-3 md:grid-cols-[minmax(14rem,1fr)_auto_auto_auto_auto_auto] md:items-end">
            <div className="space-y-1">
              <Label htmlFor="audit_search" className="text-xs">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="audit_search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="User, lab no, record id, details..."
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="audit_action" className="text-xs">Action</Label>
              <NativeSelect id="audit_action" value={action} onChange={(e) => setAction(e.target.value)} className="md:w-40">
                <option value="">All actions</option>
                {data?.actions.map((a) => <option key={a} value={a}>{a}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="audit_entity" className="text-xs">Record type</Label>
              <NativeSelect id="audit_entity" value={entity} onChange={(e) => setEntity(e.target.value)} className="md:w-44">
                <option value="">All records</option>
                {data?.entities.map((n) => <option key={n} value={n}>{entityLabel(n)}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="audit_from" className="text-xs">From</Label>
              <DatePicker id="audit_from" className="md:w-40" clearable max={toDate || today} value={fromDate} onChange={setFromDate} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="audit_to" className="text-xs">To</Label>
              <DatePicker id="audit_to" className="md:w-40" clearable min={fromDate || undefined} max={today} value={toDate} onChange={setToDate} />
            </div>
            <Button variant="ghost" onClick={clearFilters} disabled={!hasFilters}>
              <X /> Clear
            </Button>
          </div>

          {error && (
            <div className="m-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
              <Button size="sm" variant="outline" onClick={load}>Retry</Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-48 px-4 py-2.5">Date &amp; Time</th>
                  <th className="w-48 px-4 py-2.5">User</th>
                  <th className="w-32 px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Description</th>
                  <th className="w-40 px-4 py-2.5">Record</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className={cn('divide-y', loading && data && 'opacity-60')}>
                {loading && !data && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading audit trail...
                    </td>
                  </tr>
                )}
                {data && data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      {hasFilters ? 'No entries match these filters.' : 'No audit entries yet.'}
                    </td>
                  </tr>
                )}
                {data?.items.map((e) => {
                  const open = expanded === e.id;
                  return (
                    <Fragment key={e.id}>
                      <tr
                        className="cursor-pointer hover:bg-slate-50/70"
                        onClick={() => setExpanded(open ? null : e.id)}
                        aria-expanded={open}
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{formatDateTime(e.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-900">{e.staff_name ?? e.username ?? 'System'}</p>
                          {e.username && <p className="font-mono text-xs text-slate-500">{e.username}</p>}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={ACTION_TONE[e.action] ?? 'slate'}>{e.action}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{describe(e)}</td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {entityLabel(e.entity_name)}
                          {e.entity_id !== null && <span className="font-mono text-xs text-slate-400"> #{e.entity_id}</span>}
                        </td>
                        <td className="px-2 py-2.5 text-slate-400">
                          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50">
                          <td colSpan={6} className="px-4 py-3">
                            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-white p-3 font-mono text-xs text-slate-700">
                              {e.details ? JSON.stringify(e.details, null, 2) : 'No additional details recorded.'}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data && data.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-slate-600">
              <span>
                Showing {(data.page - 1) * data.page_size + 1}-{Math.min(data.page * data.page_size, data.total)} of {data.total}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || loading}>
                  <ChevronLeft /> Previous
                </Button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages || loading}>
                  Next <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ClipboardList,
  FileCheck2,
  FilePlus2,
  FlaskConical,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/reports/StatusPill';
import { useAuth } from '@/context/AuthContext';
import { fetchDashboardStats } from '@/features/requisitions/api';
import { primaryReportLabel, primaryReportPath } from '@/features/requisitions/links';
import { REQUISITION_ENTRY_ROLES } from '@/layout/navigation';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/types/requisition';

interface KpiCard {
  key: keyof Omit<DashboardStats, 'recentRequisitions'>;
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
  to: string;
}

const KPIS: KpiCard[] = [
  {
    key: 'samplesToday',
    label: 'Samples Received Today',
    hint: 'Requisitions registered today',
    icon: FlaskConical,
    tone: 'bg-sky-50 text-sky-600',
    to: '/requisitions',
  },
  {
    key: 'pendingReports',
    label: 'Pending Reports',
    hint: 'Paid & received, no report entered yet',
    icon: ClipboardList,
    tone: 'bg-amber-50 text-amber-600',
    to: '/requisitions?status=RECEIVED',
  },
  {
    key: 'awaitingVerification',
    label: 'Awaiting Verification',
    hint: 'Report entered, not yet verified',
    icon: ShieldCheck,
    tone: 'bg-violet-50 text-violet-600',
    to: '/requisitions?status=REPORT_ENTERED',
  },
  {
    key: 'verifiedThisWeek',
    label: 'Verified This Week',
    hint: 'Fully verified in the last 7 days',
    icon: FileCheck2,
    tone: 'bg-emerald-50 text-emerald-600',
    to: '/requisitions?status=VERIFIED',
  },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchDashboardStats());
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load dashboard statistics'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recent = stats?.recentRequisitions ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Welcome, {user?.name}</h2>
          <p className="text-sm text-muted-foreground">Overview of laboratory activity.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} /> Refresh
          </Button>
          {user && REQUISITION_ENTRY_ROLES.includes(user.role) && (
            <Button asChild>
              <Link to="/requisition/new">
                <FilePlus2 /> New Requisition
              </Link>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map(({ key, label, hint, icon: Icon, tone, to }) => (
          <Link key={key} to={to} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition group-hover:border-primary/40 group-hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', tone)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-semibold tabular-nums text-slate-900">
                    {stats ? stats[key] : loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-300" /> : '-'}
                  </p>
                  <p className="text-sm font-medium text-slate-700">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">{hint}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div className="space-y-1.5">
            <CardTitle>Recent Requisitions</CardTitle>
            <CardDescription>The 10 most recently registered samples.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/requisitions">
              View all <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-y bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Lab No</th>
                  <th className="px-4 py-2.5">Patient Name</th>
                  <th className="px-4 py-2.5">Sample</th>
                  <th className="px-4 py-2.5">Receiving Date</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className={cn('divide-y', loading && stats && 'opacity-60')}>
                {loading && !stats && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading recent requisitions...
                    </td>
                  </tr>
                )}
                {stats && recent.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      No requisitions yet. Register the first sample to get started.
                    </td>
                  </tr>
                )}
                {recent.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-slate-900">{r.lab_no}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.patient.name}</td>
                    <td className="px-4 py-3 text-slate-600">{r.sample_nature || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(r.sample_received_datetime)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild size="sm" variant={r.status === 'RECEIVED' ? 'default' : 'outline'}>
                        <Link to={primaryReportPath(r)}>
                          {primaryReportLabel(r)} <ArrowRight />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, FileText, FileWarning, Inbox, Loader2, Microscope, Printer, RefreshCw, Search, X } from 'lucide-react';
import { DRAFT_PRINT_HINT } from '@/components/reports/ReportPageFrame';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { TablePagination } from '@/components/TablePagination';
import { fetchReportArchive } from '@/features/reports/api';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useFilterParams } from '@/lib/useFilterParams';
import { cn } from '@/lib/utils';
import type { ReportArchivePage, ReportType } from '@/types/report';

const PAGE_SIZE = 25;

const TYPE_META: Record<ReportType, { label: string; icon: typeof FileText }> = {
  general: { label: 'General Culture', icon: FileText },
  antibiogram: { label: 'Antibiogram', icon: Microscope },
};

const isType = (v: string | null): v is ReportType => v === 'general' || v === 'antibiogram';

export default function ReportsPage() {
  const { params, search, setSearch, urlSearch, page, update, clear } = useFilterParams();
  const typeParam = params.get('type');
  const type = isType(typeParam) ? typeParam : '';
  const verifiedParam = params.get('verified');
  const verified = verifiedParam === 'true' || verifiedParam === 'false' ? verifiedParam : '';

  const [data, setData] = useState<ReportArchivePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await fetchReportArchive({
          search: urlSearch || undefined,
          type: type || undefined,
          isVerified: verified ? verified === 'true' : undefined,
          page,
          pageSize: PAGE_SIZE,
        }),
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load reports'));
    } finally {
      setLoading(false);
    }
  }, [urlSearch, type, verified, page]);

  useEffect(() => {
    load();
  }, [load]);

  const hasFilters = !!(search || type || verified);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Archive</p>
          <h2 className="text-xl font-semibold text-foreground">Reports Archive</h2>
          <p className="text-sm text-muted-foreground">All general culture and antibiogram reports, newest first.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid gap-3 border-b px-4 py-3 sm:grid-cols-2 sm:items-end lg:grid-cols-[minmax(14rem,1fr)_auto_auto_auto]">
            <div className="space-y-1">
              <Label htmlFor="rep_search" className="text-xs">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="rep_search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Lab no or patient name..."
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rep_type" className="text-xs">Report type</Label>
              <NativeSelect id="rep_type" value={type} onChange={(e) => update({ type: e.target.value })} className="lg:w-44">
                <option value="">All Types</option>
                <option value="general">General Culture</option>
                <option value="antibiogram">Antibiogram</option>
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rep_verified" className="text-xs">Verification</Label>
              <NativeSelect
                id="rep_verified"
                value={verified}
                onChange={(e) => update({ verified: e.target.value })}
                className="lg:w-48"
              >
                <option value="">All</option>
                <option value="true">Verified</option>
                <option value="false">Pending Verification</option>
              </NativeSelect>
            </div>
            <Button variant="ghost" onClick={clear} disabled={!hasFilters}>
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
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Lab No</th>
                  <th className="px-4 py-2.5">Patient Name</th>
                  <th className="px-4 py-2.5">Report Type</th>
                  <th className="px-4 py-2.5">Prepared By</th>
                  <th className="px-4 py-2.5">Reported By</th>
                  <th className="px-4 py-2.5">Date Created</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={cn('divide-y', loading && data && 'opacity-60')}>
                {loading && !data && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading reports...
                    </td>
                  </tr>
                )}
                {data && data.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      {hasFilters ? 'No reports match these filters.' : 'No reports have been entered yet.'}
                    </td>
                  </tr>
                )}
                {data?.items.map((r) => {
                  const meta = TYPE_META[r.report_type];
                  const path = `/reports/${r.report_type}/${r.requisition_id}`;
                  return (
                    <tr key={`${r.report_type}-${r.report_id}`} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-slate-900">{r.lab_no}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.patient.name}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 font-medium text-slate-800">
                          <meta.icon className="h-4 w-4 text-slate-500" /> {meta.label}
                        </span>
                        {r.summary && (
                          <p className="max-w-[16rem] truncate text-xs text-slate-500" title={r.summary}>
                            {r.summary}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.prepared_by_name ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.reported_by_name ?? '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(r.created_at)}</td>
                      <td className="px-4 py-3">
                        {r.is_verified ? (
                          <Badge tone="emerald" title={r.verified_by_name ? `Verified by ${r.verified_by_name}` : undefined}>
                            Verified
                          </Badge>
                        ) : (
                          <Badge tone="amber" title={DRAFT_PRINT_HINT}>
                            <FileWarning className="mr-1 h-3 w-3" /> Draft
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button asChild size="sm" variant="ghost" title="Open without printing">
                            <Link to={path}>
                              <Eye /> View
                            </Link>
                          </Button>
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            title={r.is_verified ? 'Open the report and the A4 print dialog' : DRAFT_PRINT_HINT}
                          >
                            <Link to={`${path}?print=1`}>
                              <Printer /> {r.is_verified ? 'View & Print' : 'Print Draft'}
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data && (
            <TablePagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              loading={loading}
              onPageChange={(p) => update({ page: String(p) })}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

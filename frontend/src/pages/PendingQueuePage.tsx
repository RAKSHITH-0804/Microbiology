import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText, Inbox, Loader2, Microscope, Pencil, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/reports/StatusPill';
import { PatientDetails, SampleBadge } from '@/components/requisitions/PatientCells';
import { ReportStaff } from '@/components/requisitions/ReportStaff';
import { useAuth } from '@/context/AuthContext';
import { fetchPendingRequisitions } from '@/features/requisitions/api';
import { canUse, REQUISITION_EDIT_ROLES } from '@/layout/navigation';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { PendingRequisition } from '@/types/requisition';

export default function PendingQueuePage() {
  const { user } = useAuth();
  const canEditRequisitions = canUse(user, REQUISITION_EDIT_ROLES, 'requisitions', 'pending_worklist');
  const [rows, setRows] = useState<PendingRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchPendingRequisitions());
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load the worklist'));
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
        ? rows.filter((r) =>
            [r.lab_no, r.receipt_no, r.patient.name, r.patient.phone, r.sample_nature, r.prepared_by_name, r.reported_by_name].some((v) =>
              v?.toLowerCase().includes(term),
            ),
          )
        : rows,
    [rows, term],
  );
  const receivedCount = rows.filter((r) => r.status === 'RECEIVED').length;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Pending Worklist</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} sample(s) awaiting verification - {receivedCount} without a report yet
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lab no, patient, phone, sample, staff"
              className="w-64 pl-8"
            />
          </div>
          <Button type="button" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Incoming Samples</CardTitle>
          <CardDescription>Open a sample to enter its general culture report or antibiogram.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="mx-6 mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
              <Button type="button" size="sm" variant="outline" onClick={load}>Retry</Button>
            </div>
          )}

          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[12%]" />
              <col />
              <col className="w-[13%]" />
              <col className="w-[12%]" />
              <col className="w-[15%]" />
              <col className="w-[10%]" />
              <col className="w-[11rem]" />
            </colgroup>
            <thead>
              <tr className="border-y bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">Lab / Receipt No</th>
                <th className="px-3 py-2.5">Patient Details</th>
                <th className="px-3 py-2.5">Specimen / Sample</th>
                <th className="px-3 py-2.5">Received On</th>
                <th className="px-3 py-2.5">Prepared / Reported By</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading worklist...
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    {term ? 'No samples match your search.' : 'No pending samples. New requisitions will appear here.'}
                  </td>
                </tr>
              )}
              {visible.map((r) => (
                <tr key={r.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-3 py-3">
                    <p className="break-words font-mono font-semibold text-slate-900">{r.lab_no}</p>
                    <p className="mt-0.5 break-words text-xs text-slate-500">Receipt {r.receipt_no || '-'}</p>
                  </td>
                  <td className="px-3 py-3">
                    <PatientDetails patient={r.patient} />
                  </td>
                  <td className="px-3 py-3">
                    <SampleBadge sample={r.sample_nature} />
                  </td>
                  <td className="px-3 py-3 text-slate-600">{formatDateTime(r.sample_received_datetime)}</td>
                  <td className="px-3 py-3">
                    <ReportStaff preparedBy={r.prepared_by_name} reportedBy={r.reported_by_name} />
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex w-36 flex-col items-stretch gap-1.5">
                      {canEditRequisitions && (
                        <Button asChild size="sm" variant="outline" className="justify-start" title="Edit requisition">
                          <Link to={`/requisition/edit/${r.id}`}>
                            <Pencil /> Edit
                          </Link>
                        </Button>
                      )}
                      <Button asChild size="sm" className="justify-start">
                        <Link to={`/reports/general/${r.id}`}>
                          {r.general_report_id ? <CheckCircle2 /> : <FileText />}
                          General Report
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="secondary" className="justify-start">
                        <Link to={`/reports/antibiogram/${r.id}`}>
                          {r.antibiogram_report_id ? <CheckCircle2 className="text-emerald-600" /> : <Microscope />}
                          Antibiogram Report
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ExternalLink, Inbox, Loader2, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fetchUnverifiedReports, verifyReport } from '@/features/admin/api';
import { fetchRequisition } from '@/features/reports/api';
import { getErrorMessage } from '@/lib/api';
import { formatAge, formatDateTime, formatSex } from '@/lib/format';
import type { UnverifiedReport } from '@/types/admin';
import { SENSITIVITY_OPTIONS, type RequisitionDetail } from '@/types/report';

const TYPE_LABEL = { general: 'General', antibiogram: 'Antibiogram' } as const;

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">{value || '-'}</dd>
    </div>
  );
}

function ReviewDialog({
  report,
  onClose,
  onVerified,
}: {
  report: UnverifiedReport | null;
  onClose: () => void;
  onVerified: (report: UnverifiedReport) => void;
}) {
  const [detail, setDetail] = useState<RequisitionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(async () => {
    if (!report) return;
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      setDetail(await fetchRequisition(report.requisition_id));
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load the report'));
    } finally {
      setLoading(false);
    }
  }, [report]);

  useEffect(() => {
    load();
  }, [load]);

  const handleVerify = async () => {
    if (!report) return;
    setVerifying(true);
    try {
      const result = await verifyReport(report.report_type, report.report_id);
      toast.success(`${TYPE_LABEL[report.report_type]} report for Lab No ${result.lab_no} verified and locked`, {
        description: result.requisition_status === 'VERIFIED' ? 'All reports for this sample are now verified.' : undefined,
      });
      onVerified(report);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not verify the report'));
    } finally {
      setVerifying(false);
    }
  };

  const general = detail?.general_report;
  const antibiogram = detail?.antibiogram_report;

  return (
    <Dialog open={!!report} onOpenChange={(open) => !open && !verifying && onClose()}>
      <DialogContent className="max-w-3xl">
        {report && (
          <>
            <DialogHeader>
              <DialogTitle>
                Review {TYPE_LABEL[report.report_type]} Report - <span className="font-mono">{report.lab_no}</span>
              </DialogTitle>
              <DialogDescription>
                Check the draft carefully. Once verified, the report and its requisition can no longer be edited.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-5">
              {loading && (
                <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading report...
                </div>
              )}
              {error && (
                <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                  <Button size="sm" variant="outline" onClick={load}>Retry</Button>
                </div>
              )}
              {detail && (
                <>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border bg-slate-50 p-4 sm:grid-cols-3">
                    <Field label="Patient" value={detail.patient.name} />
                    <Field label="Age / Sex" value={`${formatAge(detail.patient)} / ${formatSex(detail.patient.sex)}`} />
                    <Field label="Hospital / Ward" value={[detail.hospital, detail.ward_unit].filter(Boolean).join(' / ')} />
                    <Field label="Sample" value={[detail.sample_nature, detail.site_of_collection].filter(Boolean).join(' - ')} />
                    <Field label="Date of Receiving" value={formatDateTime(detail.sample_received_datetime)} />
                    <Field label="Date of Reporting" value={formatDateTime(report.reporting_datetime)} />
                    <Field label="Prepared by" value={report.prepared_by_name} />
                    <Field label="Reported by" value={report.reported_by_name} />
                    <Field label="Clinical Diagnosis" value={detail.clinical_diagnosis} />
                  </dl>

                  {report.report_type === 'general' && general && (
                    <section className="space-y-3">
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <Field label="Specimen" value={general.specimen} />
                        <Field label="Investigation Done" value={general.investigation_done} />
                      </dl>
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Report Findings</p>
                        <div className="whitespace-pre-wrap rounded-lg border bg-white p-4 font-serif text-[15px] leading-relaxed">
                          {general.report_findings}
                        </div>
                      </div>
                    </section>
                  )}

                  {report.report_type === 'antibiogram' && antibiogram && (
                    <section className="space-y-3">
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <Field label="Organism Isolated" value={antibiogram.organism_isolated} />
                        <Field label="Antibiogram" value={antibiogram.grams_stain_remark} />
                      </dl>
                      <div className="overflow-hidden rounded-lg border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                              <th className="w-12 px-3 py-2 text-center">#</th>
                              <th className="px-3 py-2">Antibiotic</th>
                              {SENSITIVITY_OPTIONS.map((o) => (
                                <th key={o.value} className="w-28 px-3 py-2 text-center">{o.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {antibiogram.results.map((r, i) => (
                              <tr key={r.antibiotic_name}>
                                <td className="px-3 py-1.5 text-center text-slate-500">{i + 1}</td>
                                <td className="px-3 py-1.5 font-medium">{r.antibiotic_name}</td>
                                {SENSITIVITY_OPTIONS.map((o) => (
                                  <td key={o.value} className="px-3 py-1.5 text-center">
                                    {r.sensitivity_result === o.value && (
                                      <span
                                        className={
                                          o.value === 'S'
                                            ? 'font-bold text-emerald-600'
                                            : o.value === 'R'
                                              ? 'font-bold text-red-600'
                                              : 'font-bold text-amber-600'
                                        }
                                      >
                                        {o.short}
                                      </span>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </>
              )}
            </DialogBody>
            <DialogFooter>
              <Button asChild variant="ghost" className="mr-auto">
                <Link to={`/reports/${report.report_type}/${report.requisition_id}`}>
                  <ExternalLink /> Open report page
                </Link>
              </Button>
              <Button variant="outline" onClick={onClose} disabled={verifying}>Cancel</Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleVerify}
                disabled={verifying || !detail}
              >
                {verifying ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                {verifying ? 'Verifying...' : 'Verify & Lock Report'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function VerificationPage() {
  const [rows, setRows] = useState<UnverifiedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [reviewing, setReviewing] = useState<UnverifiedReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchUnverifiedReports());
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load the verification queue'));
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
            [r.lab_no, r.patient.name, r.reported_by_name, TYPE_LABEL[r.report_type]].some((v) => v?.toLowerCase().includes(term)),
          )
        : rows,
    [rows, term],
  );

  const handleVerified = (report: UnverifiedReport) => {
    setRows((current) => current.filter((r) => !(r.report_type === report.report_type && r.report_id === report.report_id)));
    setReviewing(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Step 3 - Verification</p>
          <h2 className="text-xl font-semibold text-foreground">Report Verification</h2>
          <p className="text-sm text-muted-foreground">{rows.length} report(s) awaiting doctor verification</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lab no, patient, doctor"
              className="w-64 pl-8"
            />
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Pending Verification</CardTitle>
          <CardDescription>Oldest reports first. Review each draft before verifying and locking it.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="mx-6 mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
              <Button size="sm" variant="outline" onClick={load}>Retry</Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-y bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Lab No</th>
                  <th className="px-4 py-2.5">Patient Name</th>
                  <th className="px-4 py-2.5">Age / Sex</th>
                  <th className="px-4 py-2.5">Report Type</th>
                  <th className="px-4 py-2.5">Reported By</th>
                  <th className="px-4 py-2.5">Reporting Date</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading reports...
                    </td>
                  </tr>
                )}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      {term ? 'No reports match your search.' : 'Nothing to verify. All entered reports are verified.'}
                    </td>
                  </tr>
                )}
                {visible.map((r) => (
                  <tr key={`${r.report_type}-${r.report_id}`} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-slate-900">{r.lab_no}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.patient.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatAge(r.patient)} / {formatSex(r.patient.sex)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={r.report_type === 'general' ? 'blue' : 'violet'}>{TYPE_LABEL[r.report_type]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.reported_by_name || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(r.reporting_datetime)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" onClick={() => setReviewing(r)}>
                        <ShieldCheck /> Review &amp; Verify
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ReviewDialog report={reviewing} onClose={() => setReviewing(null)} onVerified={handleVerified} />
    </div>
  );
}

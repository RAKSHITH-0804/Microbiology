import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  FilePlus2,
  FileText,
  Inbox,
  Loader2,
  Lock,
  Microscope,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/DatePicker';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { StatusPill } from '@/components/reports/StatusPill';
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge';
import { PaymentActionButton } from '@/components/requisitions/PaymentActionButton';
import { PatientDetails, SampleBadge } from '@/components/requisitions/PatientCells';
import { ReportStaff } from '@/components/requisitions/ReportStaff';
import { UpdatePaymentDialog } from '@/components/requisitions/UpdatePaymentDialog';
import { TablePagination } from '@/components/TablePagination';
import { fetchRequisitions } from '@/features/requisitions/api';
import { formatRupees, isNoCounterPayment, PAYMENT_STATUS_META, paymentModeLabel } from '@/features/requisitions/payment';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useFilterParams } from '@/lib/useFilterParams';
import { useAuth } from '@/context/AuthContext';
import { canUse, REQUISITION_EDIT_ROLES, REQUISITION_ENTRY_ROLES, REVENUE_ROLES } from '@/layout/navigation';
import { cn } from '@/lib/utils';
import {
  PAYMENT_STATUSES,
  type PaymentStatus,
  type PaymentTarget,
  type PendingRequisition,
  type RequisitionListPage,
  type RequisitionStatus,
} from '@/types/requisition';

const PAGE_SIZE = 25;

const STATUS_OPTIONS: { value: RequisitionStatus; label: string }[] = [
  { value: 'RECEIVED', label: 'Received' },
  { value: 'REPORT_ENTERED', label: 'Report Entered' },
  { value: 'VERIFIED', label: 'Verified' },
];

const isStatus = (v: string | null): v is RequisitionStatus => STATUS_OPTIONS.some((o) => o.value === v);
const isPaymentStatus = (v: string | null): v is PaymentStatus => (PAYMENT_STATUSES as readonly (string | null)[]).includes(v);
const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

const isLocked = (r: PendingRequisition) =>
  r.status === 'VERIFIED' || !!r.general_report_verified || !!r.antibiogram_report_verified;

function ReportLink({
  to,
  icon: Icon,
  label,
  exists,
  verified,
}: {
  to: string;
  icon: typeof FileText;
  label: string;
  exists: boolean;
  verified: boolean | null;
}) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm hover:bg-slate-100">
      <Icon className="h-4 w-4 text-slate-500" />
      <span className="flex-1 font-medium text-slate-900">{label}</span>
      {verified ? (
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" /> Verified
        </span>
      ) : exists ? (
        <span className="flex items-center gap-1 text-xs font-medium text-amber-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Draft
        </span>
      ) : (
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <CircleDashed className="h-3.5 w-3.5" /> Not entered
        </span>
      )}
    </Link>
  );
}

function ViewReportsMenu({ r }: { r: PendingRequisition }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <FileText /> View Reports <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5">
        <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Reports for {r.lab_no}
        </p>
        <ReportLink
          to={`/reports/general/${r.id}`}
          icon={FileText}
          label="General Culture Report"
          exists={!!r.general_report_id}
          verified={r.general_report_verified}
        />
        <ReportLink
          to={`/reports/antibiogram/${r.id}`}
          icon={Microscope}
          label="Antibiogram Report"
          exists={!!r.antibiogram_report_id}
          verified={r.antibiogram_report_verified}
        />
      </PopoverContent>
    </Popover>
  );
}

export default function RequisitionsPage() {
  const { params, search, setSearch, urlSearch, page, update: updateParams, clear: clearFilters } = useFilterParams();
  const statusParam = params.get('status');
  const status = isStatus(statusParam) ? statusParam : '';
  const paymentParam = params.get('paymentStatus');
  const paymentStatus = isPaymentStatus(paymentParam) ? paymentParam : '';
  const fromDate = isDate(params.get('fromDate')) ? params.get('fromDate')! : '';
  const toDate = isDate(params.get('toDate')) ? params.get('toDate')! : '';

  const [data, setData] = useState<RequisitionListPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);
  const { user } = useAuth();
  const canManagePayments = canUse(user, REVENUE_ROLES, 'billing');
  const canEditRequisitions = canUse(user, REQUISITION_EDIT_ROLES, 'requisitions', 'pending_worklist');
  const canRegister = canUse(user, REQUISITION_ENTRY_ROLES, 'new_requisition');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await fetchRequisitions({
          search: urlSearch || undefined,
          status: status || undefined,
          paymentStatus: paymentStatus || undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          page,
          pageSize: PAGE_SIZE,
        }),
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load requisitions'));
    } finally {
      setLoading(false);
    }
  }, [urlSearch, status, paymentStatus, fromDate, toDate, page]);

  useEffect(() => {
    load();
  }, [load]);

  const hasFilters = !!(search || status || paymentStatus || fromDate || toDate);
  const today = new Date().toLocaleDateString('en-CA');
  const counts = data?.statusCounts;
  const allCount = counts ? counts.RECEIVED + counts.REPORT_ENTERED + counts.VERIFIED : null;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Directory</p>
          <h2 className="text-xl font-semibold text-foreground">All Requisitions</h2>
          <p className="text-sm text-muted-foreground">Every registered sample, from receipt through verification.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} /> Refresh
          </Button>
          {canRegister && (
            <Button asChild>
              <Link to="/requisition/new">
                <FilePlus2 /> New Requisition
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid gap-3 border-b px-4 py-3 sm:grid-cols-2 sm:items-end lg:grid-cols-[minmax(14rem,1fr)_auto_auto_auto_auto_auto]">
            <div className="space-y-1">
              <Label htmlFor="req_search" className="text-xs">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="req_search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Lab no, patient name, receipt no, phone..."
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="req_status" className="text-xs">Status</Label>
              <NativeSelect
                id="req_status"
                value={status}
                onChange={(e) => updateParams({ status: e.target.value })}
                className="lg:w-48"
              >
                <option value="">All Statuses{allCount !== null ? ` (${allCount})` : ''}</option>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                    {counts ? ` (${counts[o.value]})` : ''}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="req_payment" className="text-xs">Payment</Label>
              <NativeSelect
                id="req_payment"
                value={paymentStatus}
                onChange={(e) => updateParams({ paymentStatus: e.target.value })}
                className="lg:w-36"
              >
                <option value="">All Payments</option>
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{PAYMENT_STATUS_META[s].label}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="req_from" className="text-xs">Received from</Label>
              <DatePicker
                id="req_from"
                className="lg:w-40"
                clearable
                max={toDate || today}
                value={fromDate}
                onChange={(d) => updateParams({ fromDate: d })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="req_to" className="text-xs">Received to</Label>
              <DatePicker
                id="req_to"
                className="lg:w-40"
                clearable
                min={fromDate || undefined}
                max={today}
                value={toDate}
                onChange={(d) => updateParams({ toDate: d })}
              />
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
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5">Lab / Receipt No</th>
                  <th className="px-3 py-2.5">Patient Details</th>
                  <th className="px-3 py-2.5">Specimen / Sample</th>
                  <th className="px-3 py-2.5">Received On</th>
                  <th className="px-3 py-2.5">Prepared / Reported By</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Payment</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={cn('divide-y', loading && data && 'opacity-60')}>
                {loading && !data && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading requisitions...
                    </td>
                  </tr>
                )}
                {data && data.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      {hasFilters
                        ? 'No requisitions match these filters.'
                        : canEditRequisitions
                          ? 'No requisitions registered yet.'
                          : 'No requisitions with reports assigned to you yet.'}
                    </td>
                  </tr>
                )}
                {data?.items.map((r) => {
                  const locked = isLocked(r);
                  return (
                    <tr key={r.id} className="align-top hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-3 py-3">
                        <p className="font-mono font-semibold text-slate-900">{r.lab_no}</p>
                        <p className="mt-0.5 text-xs text-slate-500">Receipt {r.receipt_no || '-'}</p>
                      </td>
                      <td className="min-w-[10rem] px-3 py-3">
                        <PatientDetails patient={r.patient} />
                      </td>
                      <td className="max-w-[11rem] px-3 py-3">
                        <SampleBadge sample={r.sample_nature} />
                      </td>
                      <td className="px-3 py-3 text-slate-600">{formatDateTime(r.sample_received_datetime)}</td>
                      <td className="min-w-[10rem] px-3 py-3">
                        <ReportStaff preparedBy={r.prepared_by_name} reportedBy={r.reported_by_name} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <PaymentStatusBadge status={r.payment_status} />
                        {r.payment_status === 'HOSPITAL_CREDIT' ? (
                          <p className="mt-1 text-xs tabular-nums text-slate-500">{formatRupees(r.total_amount)} billed</p>
                        ) : (
                          r.payment_status !== 'EXEMPT' &&
                          r.total_amount > 0 && (
                            <p className="mt-1 text-xs tabular-nums text-slate-500">
                              {formatRupees(r.paid_amount)} / {formatRupees(r.total_amount)}
                            </p>
                          )
                        )}
                        {r.payment_mode && !isNoCounterPayment(r.payment_mode) && (
                          <p className="text-xs text-slate-400">{paymentModeLabel(r.payment_mode)}</p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {canManagePayments && (
                            <PaymentActionButton
                              label="Payment"
                              status={r.payment_status}
                              locked={locked}
                              canOverride={user?.role === 'HOD'}
                              onClick={() => setPaymentTarget({ ...r, patient_name: r.patient.name, is_verified: locked })}
                            />
                          )}
                          {canEditRequisitions &&
                            (locked ? (
                              <span title="Verified requisitions are locked and cannot be edited">
                                <Button size="sm" variant="outline" disabled>
                                  <Lock /> Locked
                                </Button>
                              </span>
                            ) : (
                              <Button asChild size="sm" variant="outline" title="Edit requisition">
                                <Link to={`/requisition/edit/${r.id}`}>
                                  <Pencil /> Edit Requisition
                                </Link>
                              </Button>
                            ))}
                          <ViewReportsMenu r={r} />
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
              onPageChange={(p) => updateParams({ page: String(p) })}
            />
          )}
        </CardContent>
      </Card>

      <UpdatePaymentDialog requisition={paymentTarget} onClose={() => setPaymentTarget(null)} onSaved={load} />
    </div>
  );
}

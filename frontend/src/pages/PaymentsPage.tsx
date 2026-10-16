import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BadgeIndianRupee,
  CalendarRange,
  ChevronDown,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  HandCoins,
  History,
  Inbox,
  Landmark,
  Loader2,
  Phone,
  ReceiptIndianRupee,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/DatePicker';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge';
import { PaymentActionButton } from '@/components/requisitions/PaymentActionButton';
import { UpdatePaymentDialog } from '@/components/requisitions/UpdatePaymentDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TablePagination } from '@/components/TablePagination';
import { useAuth } from '@/context/AuthContext';
import {
  fetchPatientLedger,
  fetchPaymentHistory,
  fetchPaymentSummary,
  logRevenueExport,
  type ExportLogEntry,
} from '@/features/payments/api';
import {
  downloadCsv,
  downloadPdf,
  downloadXlsx,
  modeName,
  referredBy,
  type ExportFormat,
  type RevenueExport,
} from '@/features/payments/export';
import { CancelledBadge } from '@/components/requisitions/CancelledNotice';
import { isNoCounterPayment, PAYMENT_STATUS_META } from '@/features/requisitions/payment';
import { getErrorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { formatPaise } from '@/lib/money';
import { useFilterParams } from '@/lib/useFilterParams';
import { cn } from '@/lib/utils';
import type { PatientLedger, PaymentFilters, PaymentHistoryPage, PaymentSummary, PaymentTransaction } from '@/types/payments';
import {
  PAYMENT_MODES,
  PAYMENT_STATUSES,
  type PaymentMode,
  type PaymentStatus,
  type PaymentTarget,
} from '@/types/requisition';

const PAGE_SIZE = 25;
const EXPORT_LIMIT = 5000;

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMode = (v: string | null): v is PaymentMode => PAYMENT_MODES.some((m) => m.value === v);
const isPaymentStatus = (v: string | null): v is PaymentStatus => (PAYMENT_STATUSES as readonly (string | null)[]).includes(v);

function datePresets() {
  const today = new Date();
  return [
    { id: 'today', label: 'Today', start: ymd(today), end: ymd(today) },
    { id: 'yesterday', label: 'Yesterday', start: ymd(subDays(today, 1)), end: ymd(subDays(today, 1)) },
    { id: 'week', label: 'This Week', start: ymd(startOfWeek(today, { weekStartsOn: 1 })), end: ymd(today) },
    { id: 'month', label: 'This Month', start: ymd(startOfMonth(today)), end: ymd(today) },
  ];
}

const EXPORTERS: Record<
  ExportFormat,
  {
    label: string;
    icon: typeof FileText;
    auditFormat: ExportLogEntry['exportFormat'];
    run: (e: RevenueExport) => void | Promise<void>;
  }
> = {
  csv: { label: 'Export CSV (.csv)', icon: FileText, auditFormat: 'CSV', run: downloadCsv },
  xlsx: { label: 'Export Excel (.xlsx)', icon: FileSpreadsheet, auditFormat: 'EXCEL', run: downloadXlsx },
  pdf: { label: 'Export PDF (.pdf)', icon: FileDown, auditFormat: 'PDF', run: downloadPdf },
};

const toTarget = (t: PaymentTransaction): PaymentTarget => ({
  id: t.id,
  lab_no: t.lab_no,
  patient_name: t.patient_name,
  total_amount_paise: t.total_amount_paise,
  paid_amount_paise: t.paid_amount_paise,
  payment_mode: t.payment_mode,
  payment_status: t.payment_status,
  exempt_referred_by: t.exempt_referred_by,
  is_verified: t.is_verified,
});

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  border,
  tone,
  loading,
}: {
  label: string;
  value: number | undefined;
  hint: string;
  icon: typeof Wallet;
  border: string;
  tone: string;
  loading: boolean;
}) {
  return (
    <Card className={cn('h-full border-l-4', border)}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold tabular-nums text-slate-900">
            {value !== undefined ? formatPaise(value) : loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-300" /> : '-'}
          </p>
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PatientHistory({
  query,
  onSearch,
  onPay,
  canOverride,
  refreshKey,
}: {
  query: string;
  onSearch: (q: string) => void;
  onPay: (t: PaymentTarget) => void;
  canOverride: boolean;
  refreshKey: number;
}) {
  const [input, setInput] = useState(query);
  const [ledger, setLedger] = useState<PatientLedger | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setInput(query), [query]);

  const load = useCallback(async () => {
    if (!query) {
      setLedger(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setLedger(await fetchPatientLedger(/^\d{10}$/.test(query) ? { phone_no: query } : { patient_name: query }));
    } catch (err) {
      setLedger(null);
      setError(getErrorMessage(err, 'Could not load the patient history'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (/^\d+$/.test(q) && q.length !== 10) {
      setError('Phone number must be exactly 10 digits');
      return;
    }
    if (!/^\d+$/.test(q) && q.length < 2) {
      setError('Enter a 10-digit phone number or the patient name');
      return;
    }
    onSearch(q);
  };

  const primary = ledger?.patients[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1 space-y-1">
              <Label htmlFor="ledger_q" className="text-xs">Phone number or full patient name</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="ledger_q"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g. 9876543210 or Rajesh Kumar"
                  className="pl-8"
                  autoComplete="off"
                />
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <History />} Look up history
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {!query && (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          <UserRound className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          Search by phone number to see every visit and payment for a returning patient.
        </div>
      )}

      {ledger && ledger.total_visits === 0 && (
        <Card>
          <CardContent className="space-y-3 p-5 text-sm">
            <p className="text-muted-foreground">No visits found for "{query}".</p>
            {ledger.suggestions.length > 0 && (
              <div>
                <p className="mb-2 font-medium text-slate-700">Did you mean:</p>
                <div className="flex flex-wrap gap-2">
                  {ledger.suggestions.map((s) => (
                    <Button key={s.id} type="button" size="sm" variant="outline" onClick={() => onSearch(s.phone ?? s.name)}>
                      {s.name}
                      {s.phone && <span className="text-muted-foreground">{s.phone}</span>}
                      <span className="rounded bg-slate-100 px-1.5 text-xs">{s.visits} visit(s)</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {ledger && primary && (
        <>
          <Card>
            <CardContent className="grid gap-4 p-5 md:grid-cols-[1.4fr_repeat(4,1fr)]">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{primary.name}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" /> {primary.phone ?? 'No phone on record'}
                  </p>
                </div>
              </div>
              {[
                { label: 'Total Visits', value: String(ledger.total_visits), tone: 'text-slate-900' },
                { label: 'Lifetime Billed', value: formatPaise(ledger.lifetime_billed_paise), tone: 'text-slate-900' },
                { label: 'Lifetime Paid', value: formatPaise(ledger.lifetime_paid_paise), tone: 'text-emerald-700' },
                {
                  label: 'Balance Due',
                  value: formatPaise(ledger.lifetime_balance_due_paise),
                  tone: ledger.lifetime_balance_due_paise > 0 ? 'text-amber-700' : 'text-slate-900',
                },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                  <p className={cn('text-lg font-semibold tabular-nums', s.tone)}>{s.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {ledger.patients.length > 1 && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {ledger.patients.length} patient records match this search (
              {ledger.patients.map((p) => `${p.name}${p.phone ? ` - ${p.phone}` : ''}`).join('; ')}). Search by phone number to
              narrow it to one person.
            </p>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Visit Timeline</CardTitle>
              <CardDescription>Every lab visit for this patient, oldest first.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6">
                {ledger.visits.map((v, i) => (
                  <li key={v.id} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[33px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white',
                        v.payment_status === 'PAID'
                          ? 'bg-emerald-500'
                          : v.payment_status === 'EXEMPT'
                            ? 'bg-violet-500'
                            : v.payment_status === 'HOSPITAL_CREDIT'
                              ? 'bg-blue-500'
                            : v.payment_status === 'PARTIAL'
                              ? 'bg-amber-500'
                              : 'bg-red-500',
                      )}
                    />
                    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-white px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          Visit {i + 1}: <span className="font-mono">{v.lab_no}</span>{' '}
                          <span className="font-normal text-slate-600">
                            ({formatPaise(v.paid_amount_paise)} {PAYMENT_STATUS_META[v.payment_status].label})
                          </span>
                          {v.cancelled_at && <CancelledBadge className="ml-2 align-middle" />}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(v.created_at)}
                          {v.sample_nature && ` - ${v.sample_nature}`}
                          {v.payment_mode && ` - ${modeName(v.payment_mode)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs tabular-nums text-slate-600">
                          <p>Billed {formatPaise(v.total_amount_paise)}</p>
                          {v.balance_due_paise > 0 && (
                            <p className="font-medium text-amber-700">Due {formatPaise(v.balance_due_paise)}</p>
                          )}
                        </div>
                        <PaymentStatusBadge status={v.payment_status} />
                        {!v.cancelled_at && (
                          <PaymentActionButton
                            label="Update"
                            status={v.payment_status}
                            locked={v.is_verified}
                            canOverride={canOverride}
                            onClick={() => onPay(toTarget(v))}
                          />
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function PaymentsPage() {
  const { params, search, setSearch, urlSearch, page, update: updateParams, clear: clearFilters } = useFilterParams();
  const presets = useMemo(datePresets, []);
  const today = presets[0].start;

  const startDate = isDate(params.get('startDate')) ? params.get('startDate')! : today;
  const endDate = isDate(params.get('endDate')) ? params.get('endDate')! : today;
  const modeParam = params.get('paymentMode');
  const paymentMode = isMode(modeParam) ? modeParam : '';
  const statusParam = params.get('paymentStatus');
  const paymentStatus = isPaymentStatus(statusParam) ? statusParam : '';
  const tab = params.get('tab') === 'patients' ? 'patients' : 'ledger';
  const patientQuery = params.get('patient') ?? '';

  const activePreset = presets.find((p) => p.start === startDate && p.end === endDate)?.id ?? 'custom';
  const [customOpen, setCustomOpen] = useState(activePreset === 'custom');
  const [openPicker, setOpenPicker] = useState<'start' | 'end' | null>(null);

  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [history, setHistory] = useState<PaymentHistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);
  const [ledgerRefresh, setLedgerRefresh] = useState(0);
  const { user } = useAuth();
  const canOverride = user?.role === 'HOD';

  const filters: PaymentFilters = useMemo(
    () => ({
      startDate,
      endDate,
      paymentMode: paymentMode || undefined,
      paymentStatus: paymentStatus || undefined,
    }),
    [startDate, endDate, paymentMode, paymentStatus],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, h] = await Promise.all([
        fetchPaymentSummary(filters),
        fetchPaymentHistory({ ...filters, search: urlSearch || undefined, page, limit: PAGE_SIZE }),
      ]);
      setSummary(s);
      setHistory(h);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load billing data'));
    } finally {
      setLoading(false);
    }
  }, [filters, urlSearch, page]);

  useEffect(() => {
    load();
  }, [load]);

  const choosePreset = (p: (typeof presets)[number]) => {
    setCustomOpen(false);
    updateParams({ startDate: p.start === today ? '' : p.start, endDate: p.end === today ? '' : p.end });
  };

  /** Picking a start date flows straight into the end-date calendar. */
  const pickRangeDate = (key: 'startDate' | 'endDate', value: string) => {
    if (!value) return;
    setCustomOpen(true);
    updateParams({ [key]: value });
    if (key === 'startDate') setOpenPicker('end');
  };

  const runExport = async (kind: ExportFormat) => {
    setExportOpen(false);
    setExporting(true);
    try {
      const all = await fetchPaymentHistory({ ...filters, search: urlSearch || undefined, page: 1, limit: EXPORT_LIMIT });
      if (all.items.length === 0) {
        toast.info('No transactions to export for these filters');
        return;
      }
      await EXPORTERS[kind].run({
        rows: all.items,
        total: all.total,
        startDate,
        endDate,
        filters: [
          paymentMode && `Mode: ${modeName(paymentMode)}`,
          paymentStatus && `Status: ${PAYMENT_STATUS_META[paymentStatus].label}`,
          urlSearch && `Search: "${urlSearch}"`,
        ].filter((f): f is string => !!f),
      });
      logRevenueExport({
        ...filters,
        exportFormat: EXPORTERS[kind].auditFormat,
        search: urlSearch || undefined,
        rowCount: all.items.length,
        totalMatching: all.total,
      }).catch(() => toast.warning('The export was downloaded but could not be recorded in the audit log'));
      if (all.total > all.items.length) {
        toast.warning(`Exported the latest ${all.items.length} of ${all.total} transactions - narrow the date range for the rest.`);
      } else toast.success(`Exported ${all.items.length} transaction(s)`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not export transactions'));
    } finally {
      setExporting(false);
    }
  };

  const afterPayment = () => {
    load();
    setLedgerRefresh((n) => n + 1);
  };

  const day = (d: string) => format(parseISO(d), 'dd MMM yyyy');
  const rangeLabel = startDate === endDate ? day(startDate) : `${day(startDate)} - ${day(endDate)}`;
  const hasFilters = !!(search || paymentMode || paymentStatus || activePreset !== 'today');

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Revenue</p>
          <h2 className="text-xl font-semibold text-foreground">Billing &amp; Revenue</h2>
          <p className="text-sm text-muted-foreground">Collections, outstanding dues and patient billing histories.</p>
        </div>
        <Button variant="outline" onClick={afterPayment} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} /> Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Today's Collection"
          value={summary?.today_collection_paise}
          hint={summary ? `${summary.today_count} requisition(s) registered today` : 'All modes, today'}
          icon={Wallet}
          border="border-l-emerald-500"
          tone="bg-emerald-50 text-emerald-600"
          loading={loading}
        />
        <KpiCard
          label="Range Collection"
          value={summary?.filtered_collection_paise}
          hint={summary ? `${rangeLabel} - billed ${formatPaise(summary.filtered_billed_paise)}` : rangeLabel}
          icon={BadgeIndianRupee}
          border="border-l-blue-500"
          tone="bg-blue-50 text-blue-600"
          loading={loading}
        />
        <KpiCard
          label="Outstanding Dues"
          value={summary?.total_outstanding_paise}
          hint="Unpaid balance in the selected range"
          icon={HandCoins}
          border="border-l-amber-500"
          tone="bg-amber-50 text-amber-600"
          loading={loading}
        />
        <KpiCard
          label="Hospital Credit"
          value={summary?.hospital_credit_total_paise}
          hint={
            summary
              ? `${summary.hospital_credit_count} on credit - ${summary.exempt_count} exempt (${formatPaise(summary.exempt_total_paise)} waived)`
              : 'Billed to the hospital'
          }
          icon={Landmark}
          border="border-l-violet-500"
          tone="bg-violet-50 text-violet-600"
          loading={loading}
        />
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {summary.breakdown_by_mode.map((m) => (
            <div key={m.mode} className="rounded-lg border bg-white px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {modeName(m.mode)}
                {isNoCounterPayment(m.mode) && <span className="normal-case tracking-normal"> (billed)</span>}
              </p>
              <p className="text-base font-semibold tabular-nums text-slate-900">
                {formatPaise(isNoCounterPayment(m.mode) ? m.billed_paise : m.collected_paise)}
              </p>
              <p className="text-xs text-muted-foreground">
                {m.count} requisition(s)
                {m.balance_due_paise > 0 && <span className="text-amber-700"> - {formatPaise(m.balance_due_paise)} due</span>}
              </p>
            </div>
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => updateParams({ tab: v === 'patients' ? 'patients' : '' })}>
        <TabsList>
          <TabsTrigger value="ledger">
            <ReceiptIndianRupee className="h-4 w-4" /> Transaction Ledger
          </TabsTrigger>
          <TabsTrigger value="patients">
            <UserRound className="h-4 w-4" /> Patient Billing History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <Card>
            <CardContent className="p-0">
              <div className="space-y-3 border-b px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-muted-foreground" />
                  {presets.map((p) => (
                    <Button
                      key={p.id}
                      size="sm"
                      variant={activePreset === p.id && !customOpen ? 'default' : 'outline'}
                      onClick={() => choosePreset(p)}
                    >
                      {p.label}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant={activePreset === 'custom' || customOpen ? 'default' : 'outline'}
                    onClick={() => {
                      setCustomOpen(true);
                      setOpenPicker('start');
                    }}
                  >
                    Custom Range
                  </Button>
                  <div className="flex items-center gap-2">
                    <DatePicker
                      aria-label="Start date"
                      className="w-40"
                      max={endDate}
                      value={startDate}
                      open={openPicker === 'start'}
                      onOpenChange={(o) => setOpenPicker(o ? 'start' : null)}
                      onChange={(d) => pickRangeDate('startDate', d)}
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <DatePicker
                      aria-label="End date"
                      className="w-40"
                      min={startDate}
                      max={today}
                      value={endDate}
                      open={openPicker === 'end'}
                      onOpenChange={(o) => setOpenPicker(o ? 'end' : null)}
                      onChange={(d) => pickRangeDate('endDate', d)}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 sm:items-end lg:grid-cols-[minmax(14rem,1fr)_auto_auto_auto_auto]">
                  <div className="space-y-1">
                    <Label htmlFor="pay_search" className="text-xs">Search</Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="pay_search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Patient name, phone, lab no or referred by..."
                        className="pl-8"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pay_mode_filter" className="text-xs">Payment Mode</Label>
                    <NativeSelect
                      id="pay_mode_filter"
                      value={paymentMode}
                      onChange={(e) => updateParams({ paymentMode: e.target.value })}
                      className="lg:w-44"
                    >
                      <option value="">All Modes</option>
                      {PAYMENT_MODES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pay_status_filter" className="text-xs">Payment Status</Label>
                    <NativeSelect
                      id="pay_status_filter"
                      value={paymentStatus}
                      onChange={(e) => updateParams({ paymentStatus: e.target.value })}
                      className="lg:w-40"
                    >
                      <option value="">All Statuses</option>
                      {PAYMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>{PAYMENT_STATUS_META[s].label}</option>
                      ))}
                    </NativeSelect>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCustomOpen(false);
                      clearFilters();
                    }}
                    disabled={!hasFilters}
                  >
                    <X /> Clear
                  </Button>
                  <Popover open={exportOpen} onOpenChange={setExportOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" disabled={exporting || !history?.total}>
                        {exporting ? <Loader2 className="animate-spin" /> : <Download />} Export <ChevronDown />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-52 p-1">
                      {(Object.keys(EXPORTERS) as ExportFormat[]).map((kind) => {
                        const { label, icon: Icon } = EXPORTERS[kind];
                        return (
                          <Button
                            key={kind}
                            variant="ghost"
                            className="w-full justify-start font-normal"
                            onClick={() => runExport(kind)}
                          >
                            <Icon /> {label}
                          </Button>
                        );
                      })}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2.5">Lab No</th>
                      <th className="px-4 py-2.5">Date &amp; Time</th>
                      <th className="px-4 py-2.5">Patient Name</th>
                      <th className="px-4 py-2.5">Phone No</th>
                      <th className="px-4 py-2.5 text-right">Total (₹)</th>
                      <th className="px-4 py-2.5 text-right">Paid (₹)</th>
                      <th className="px-4 py-2.5 text-right">Balance Due (₹)</th>
                      <th className="px-4 py-2.5">Payment Mode</th>
                      <th className="px-4 py-2.5">Referred By</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={cn('divide-y', loading && history && 'opacity-60')}>
                    {loading && !history && (
                      <tr>
                        <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading transactions...
                        </td>
                      </tr>
                    )}
                    {history && history.items.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                          <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                          No transactions match these filters for {rangeLabel}.
                        </td>
                      </tr>
                    )}
                    {history?.items.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-slate-900">
                          {t.lab_no}
                          {t.cancelled_at && <CancelledBadge className="ml-2 font-sans" />}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(t.created_at)}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{t.patient_name}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{t.phone || '-'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatPaise(t.total_amount_paise)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-emerald-700">
                          {formatPaise(t.paid_amount_paise)}
                        </td>
                        <td
                          className={cn(
                            'whitespace-nowrap px-4 py-3 text-right tabular-nums',
                            t.balance_due_paise > 0 ? 'font-semibold text-amber-700' : 'text-slate-400',
                          )}
                        >
                          {formatPaise(t.balance_due_paise)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{modeName(t.payment_mode)}</td>
                        <td className="max-w-[14rem] px-4 py-3 text-slate-600">{referredBy(t)}</td>
                        <td className="px-4 py-3">
                          <PaymentStatusBadge status={t.payment_status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {!t.cancelled_at && (
                              <PaymentActionButton
                                label="Update Payment"
                                status={t.payment_status}
                                locked={t.is_verified}
                                canOverride={canOverride}
                                onClick={() => setPaymentTarget(toTarget(t))}
                              />
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Patient billing history"
                              onClick={() => updateParams({ tab: 'patients', patient: t.phone ?? t.patient_name })}
                            >
                              <History />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {history && (
                <TablePagination
                  page={history.page}
                  pageSize={history.limit}
                  total={history.total}
                  loading={loading}
                  onPageChange={(p) => updateParams({ page: String(p) })}
                />
              )}
            </CardContent>
          </Card>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Amounts are attributed to the date each requisition was registered. Manage clinical details from{' '}
            <Link to="/requisitions" className="underline underline-offset-2 hover:text-foreground">Requisitions</Link>.
          </p>
        </TabsContent>

        <TabsContent value="patients">
          <PatientHistory
            query={patientQuery}
            onSearch={(q) => updateParams({ patient: q, tab: 'patients' })}
            onPay={setPaymentTarget}
            canOverride={canOverride}
            refreshKey={ledgerRefresh}
          />
        </TabsContent>
      </Tabs>

      <UpdatePaymentDialog requisition={paymentTarget} onClose={() => setPaymentTarget(null)} onSaved={afterPayment} />
    </div>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, Check, FileText, FlaskConical, Hourglass, Loader2, ShieldCheck, Wallet } from 'lucide-react';
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchRequisitionTimeline } from '@/features/requisitions/api';
import {
  EXEMPT_REFERRAL_LABEL,
  formatRupees,
  isNoCounterPayment,
  isReleasedForReporting,
  paymentModeLabel,
} from '@/features/requisitions/payment';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { RequisitionTimeline, TimelineReport } from '@/types/requisition';

type StepState = 'done' | 'current' | 'waiting' | 'blocked';

interface Step {
  title: string;
  icon: ReactNode;
  state: StepState;
  body: ReactNode;
}

const REPORT_LABEL: Record<TimelineReport['report_type'], string> = {
  general: 'General report',
  antibiogram: 'Culture & antibiogram',
};

const STATE_STYLE: Record<StepState, { dot: string; title: string; tag?: string }> = {
  done: { dot: 'border-emerald-500 bg-emerald-500 text-white', title: 'text-slate-900' },
  current: { dot: 'border-blue-500 bg-blue-50 text-blue-600 ring-4 ring-blue-500/15', title: 'text-slate-900', tag: 'In progress' },
  blocked: { dot: 'border-amber-500 bg-amber-50 text-amber-600 ring-4 ring-amber-500/15', title: 'text-slate-900', tag: 'Action needed' },
  waiting: { dot: 'border-slate-300 bg-white text-slate-400', title: 'text-slate-500' },
};

function Who({ label, name }: { label: string; name: string | null }) {
  return (
    <p>
      <span className="text-slate-500">{label}: </span>
      <span className="font-medium text-slate-800">{name ?? 'Not recorded'}</span>
    </p>
  );
}

function ReportLine({ report, children }: { report: TimelineReport; children: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{REPORT_LABEL[report.report_type]}</p>
      {children}
    </div>
  );
}

function buildSteps(t: RequisitionTimeline): Step[] {
  const paid = isReleasedForReporting(t.payment_status);
  const drafted = t.reports.length > 0;
  const unverified = t.reports.filter((r) => !r.is_verified);
  const allVerified = drafted && unverified.length === 0;
  const mode = paymentModeLabel(t.payment_mode);

  return [
    {
      title: 'Sample Received',
      icon: <FlaskConical className="h-4 w-4" />,
      state: 'done',
      body: (
        <>
          <p className="text-slate-700">{formatDateTime(t.received_at)}</p>
          <Who label="Registered by" name={t.received_by} />
        </>
      ),
    },
    {
      title: 'Payment Status',
      icon: <Wallet className="h-4 w-4" />,
      state: paid ? 'done' : 'blocked',
      body: (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <PaymentStatusBadge status={t.payment_status} />
            {mode && !isNoCounterPayment(t.payment_mode) && <Badge>{mode}</Badge>}
          </div>
          {t.payment_status === 'EXEMPT' ? (
            <Who label={EXEMPT_REFERRAL_LABEL} name={t.exempt_referred_by} />
          ) : t.payment_status === 'HOSPITAL_CREDIT' ? (
            <p className="text-slate-600">{formatRupees(t.total_amount)} billed to the hospital</p>
          ) : (
            <p className="text-slate-600">
              {formatRupees(t.paid_amount)} paid of {formatRupees(t.total_amount)}
            </p>
          )}
          {!paid && <p className="text-amber-700">Reports can be entered once the bill is settled.</p>}
        </>
      ),
    },
    {
      title: 'Result Drafted',
      icon: <FileText className="h-4 w-4" />,
      state: drafted ? 'done' : paid ? 'current' : 'waiting',
      body: drafted ? (
        <div className="space-y-1.5">
          {t.reports.map((r) => (
            <ReportLine key={r.report_type} report={r}>
              <p className="text-slate-700">{formatDateTime(r.drafted_at)}</p>
              <Who label="Prepared by" name={r.prepared_by_name} />
            </ReportLine>
          ))}
        </div>
      ) : (
        <p className="text-slate-500">{paid ? 'Awaiting result entry by the laboratory.' : 'Starts after payment.'}</p>
      ),
    },
    {
      title: 'Pending Verification',
      icon: <Hourglass className="h-4 w-4" />,
      state: allVerified ? 'done' : unverified.length ? 'current' : 'waiting',
      body: allVerified ? (
        <p className="text-slate-600">Verification complete.</p>
      ) : unverified.length ? (
        <div className="space-y-1.5">
          {unverified.map((r) => (
            <ReportLine key={r.report_type} report={r}>
              <p className="inline-flex items-center gap-1.5 font-medium text-blue-700">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                </span>
                Draft awaiting doctor&apos;s sign-off
              </p>
              <Who label="Reporting doctor" name={r.reported_by_name} />
            </ReportLine>
          ))}
        </div>
      ) : (
        <p className="text-slate-500">Starts once a result is drafted.</p>
      ),
    },
    {
      title: 'Verified & Released',
      icon: <ShieldCheck className="h-4 w-4" />,
      state: allVerified ? 'done' : 'waiting',
      body:
        drafted && t.reports.some((r) => r.is_verified) ? (
          <div className="space-y-1.5">
            {t.reports
              .filter((r) => r.is_verified)
              .map((r) => (
                <ReportLine key={r.report_type} report={r}>
                  <p className="text-slate-700">{r.verified_at ? formatDateTime(r.verified_at) : 'Time not recorded'}</p>
                  <Who label="Verified by" name={r.verified_by_name} />
                </ReportLine>
              ))}
          </div>
        ) : (
          <p className="text-slate-500">Final report not yet released.</p>
        ),
    },
  ];
}

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const style = STATE_STYLE[step.state];
        const last = i === steps.length - 1;
        return (
          <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5',
                  step.state === 'done' ? 'bg-emerald-500' : 'bg-slate-200',
                )}
              />
            )}
            <span
              className={cn('relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2', style.dot)}
            >
              {step.state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} /> : step.icon}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5 pt-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn('font-semibold', style.title)}>
                  <span className="mr-1.5 text-xs font-medium text-slate-400">{i + 1}.</span>
                  {step.title}
                </p>
                {style.tag && (
                  <Badge tone={step.state === 'blocked' ? 'amber' : 'blue'} className="px-2 py-0 text-[11px]">
                    {style.tag}
                  </Badge>
                )}
              </div>
              {step.body}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Horizontal overview of the five steps, for wide layouts above the detailed timeline. */
export function SampleProgressBar({ timeline }: { timeline: RequisitionTimeline }) {
  const steps = buildSteps(timeline);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Lifecycle progress">
      {steps.map((step, i) => {
        const style = STATE_STYLE[step.state];
        return (
          <li key={step.title} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2',
                  steps[i - 1].state === 'done' ? 'bg-emerald-500' : 'bg-slate-200',
                )}
              />
            )}
            <span className={cn('relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2', style.dot)}>
              {step.state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} /> : step.icon}
            </span>
            <span className={cn('mt-2 text-xs font-medium leading-tight', style.title)}>{step.title}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Loads the lifecycle of one sample; pass null to load nothing. */
export function useRequisitionTimeline(requisitionId: number | null) {
  const [timeline, setTimeline] = useState<RequisitionTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setTimeline(null);
    setError(null);
    if (requisitionId === null) return;
    let cancelled = false;
    fetchRequisitionTimeline(requisitionId)
      .then((t) => !cancelled && setTimeline(t))
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load the sample timeline')));
    return () => {
      cancelled = true;
    };
  }, [requisitionId, attempt]);

  return { timeline, error, reload: () => setAttempt((n) => n + 1) };
}

/** The five lifecycle steps, or a loading / error state while the timeline is fetched. */
export function SampleTimelineBody({
  timeline,
  error,
  onRetry,
}: {
  timeline: RequisitionTimeline | null;
  error: string | null;
  onRetry?: () => void;
}) {
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="flex-1">{error}</span>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }
  if (!timeline) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading timeline...
      </div>
    );
  }
  return <Timeline steps={buildSteps(timeline)} />;
}

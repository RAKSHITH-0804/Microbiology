import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, Lock, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ReportPageFrameProps {
  step: string;
  title: string;
  labNo?: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children?: ReactNode;
}

/** Screen-only page chrome for report entry: back link, title, and loading / error states. */
export function ReportPageFrame({ step, title, labNo, loading, error, onRetry, children }: ReportPageFrameProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-5 print:hidden">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/worklist" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Pending Worklist
          </Link>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">{step}</p>
          <h2 className="text-xl font-semibold text-foreground">
            {title}
            {labNo && <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 font-mono text-base text-slate-700">{labNo}</span>}
          </h2>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading requisition...
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {error}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>Retry</Button>
        </div>
      )}

      {!loading && !error && children}
    </div>
  );
}

export const PRINT_LOCKED_MESSAGE = 'Printing locked until verified by assigned doctor';

/** Amber lock badge shown wherever printing is unavailable because the report is not yet verified. */
export function PrintLockedBadge({ className }: { className?: string }) {
  return (
    <span
      title={PRINT_LOCKED_MESSAGE}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-300',
        className,
      )}
    >
      <Lock className="h-3.5 w-3.5" /> {PRINT_LOCKED_MESSAGE}
    </span>
  );
}

/** Rendered instead of the A4 layout for unverified reports, so the browser's own Print command shows no report either. */
export function PrintLockedNotice() {
  return (
    <div className="hidden p-12 text-center font-sans text-black print:block">
      <p className="text-lg font-bold">{PRINT_LOCKED_MESSAGE}</p>
      <p className="mt-2 text-sm">This report is a draft. It can be printed once the assigned doctor has verified it.</p>
    </div>
  );
}

interface ReportActionBarProps {
  saving: boolean;
  readOnly: boolean;
  /** True until this report has been verified; printing is only allowed for verified reports. */
  printLocked: boolean;
  onPrint: () => void;
}

export function ReportActionBar({ saving, readOnly, printLocked, onPrint }: ReportActionBarProps) {
  return (
    <div className="sticky -bottom-6 z-20 -mx-6 -mb-6 border-t bg-white/95 backdrop-blur">
      <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-3">
        {readOnly && <p className="mr-auto text-sm text-amber-700">This report is verified and can no longer be edited.</p>}
        {printLocked && <PrintLockedBadge className="mr-auto" />}
        <span title={printLocked ? PRINT_LOCKED_MESSAGE : undefined}>
          <Button type="button" variant="outline" onClick={onPrint} disabled={saving || printLocked}>
            {printLocked ? <Lock /> : <Printer />} Print Report
          </Button>
        </span>
        <Button type="submit" disabled={saving || readOnly}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? 'Saving...' : 'Save Report'}
        </Button>
      </div>
    </div>
  );
}

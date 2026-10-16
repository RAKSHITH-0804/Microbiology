import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, FileWarning, Loader2, Printer, Save, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { canUse, REQUISITION_BROWSE_ROLES } from '@/layout/navigation';
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
  const { user } = useAuth();
  const back = canUse(user, REQUISITION_BROWSE_ROLES, 'pending_worklist')
    ? { to: '/worklist', label: 'Pending Worklist' }
    : canUse(user, undefined, 'reports')
      ? { to: '/reports', label: 'Reports' }
      : { to: '/dashboard', label: 'Dashboard' };

  return (
    <div className="mx-auto max-w-6xl space-y-5 print:hidden">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to={back.to} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {back.label}
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

export const DRAFT_PRINT_TITLE = 'DRAFT REPORT';
export const DRAFT_PRINT_HINT = 'Not yet verified: prints as a watermarked draft without names or signatures';
export const NOTHING_TO_PRINT_MESSAGE = 'Save the report before printing a draft';

/** Amber badge marking an unverified report, whose printout is a signature-free draft. */
export function DraftBadge({ className }: { className?: string }) {
  return (
    <span
      title={DRAFT_PRINT_HINT}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-300',
        className,
      )}
    >
      <FileWarning className="h-3.5 w-3.5" /> {DRAFT_PRINT_HINT}
    </span>
  );
}

/** Rendered instead of the A4 layout while nothing has been saved, so the browser's own Print command shows no report. */
export function NothingToPrintNotice() {
  return (
    <div className="hidden p-12 text-center font-sans text-black print:block">
      <p className="text-lg font-bold">No report to print yet</p>
      <p className="mt-2 text-sm">{NOTHING_TO_PRINT_MESSAGE}.</p>
    </div>
  );
}

interface ReportActionBarProps {
  saving: boolean;
  readOnly: boolean;
  /** Why the form cannot be edited; shown when `readOnly`. */
  readOnlyMessage: string | null;
  /** Unverified: printing produces a draft without names or signatures. */
  draft: boolean;
  onPrint: () => void;
  /** Shown while the form is editable, e.g. the HOD correcting a verified report. */
  notice?: string | null;
  /** HOD only: sends a verified report back for re-verification. */
  onRevoke?: () => void;
}

export function ReportActionBar({ saving, readOnly, readOnlyMessage, draft, onPrint, notice, onRevoke }: ReportActionBarProps) {
  const message = readOnly ? readOnlyMessage : (notice ?? null);
  return (
    <div className="sticky -bottom-6 z-20 -mx-6 -mb-6 border-t bg-white/95 backdrop-blur">
      <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-3">
        {message && <p className="mr-auto text-sm text-amber-700">{message}</p>}
        {draft && <DraftBadge className={cn(!message && 'mr-auto')} />}
        {onRevoke && (
          <Button type="button" variant="outline" className="text-red-700" onClick={onRevoke} disabled={saving}>
            <ShieldOff /> Revoke Verification
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onPrint} disabled={saving}>
          <Printer /> {draft ? 'Print Draft Report' : 'Print Report'}
        </Button>
        <Button type="submit" disabled={saving || readOnly}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? 'Saving...' : 'Save Report'}
        </Button>
      </div>
    </div>
  );
}

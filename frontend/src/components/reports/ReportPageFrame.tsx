import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

interface ReportActionBarProps {
  saving: boolean;
  readOnly: boolean;
  needsSave: boolean;
  onPrint: () => void;
}

export function ReportActionBar({ saving, readOnly, needsSave, onPrint }: ReportActionBarProps) {
  return (
    <div className="sticky -bottom-6 z-20 -mx-6 -mb-6 border-t bg-white/95 backdrop-blur">
      <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-3">
        {readOnly && <p className="mr-auto text-sm text-amber-700">This report is verified and can no longer be edited.</p>}
        <Button type="button" variant="outline" onClick={onPrint} disabled={saving}>
          <Printer /> {needsSave && !readOnly ? 'Save & Print' : 'Print Report'}
        </Button>
        <Button type="submit" disabled={saving || readOnly}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? 'Saving...' : 'Save Report'}
        </Button>
      </div>
    </div>
  );
}

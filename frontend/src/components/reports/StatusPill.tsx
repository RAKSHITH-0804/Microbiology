import { cn } from '@/lib/utils';
import type { RequisitionStatus } from '@/types/requisition';

const STYLES: Record<RequisitionStatus, { label: string; className: string }> = {
  RECEIVED: { label: 'Received', className: 'bg-slate-100 text-slate-700 ring-slate-300' },
  REPORT_ENTERED: { label: 'Report Entered', className: 'bg-amber-100 text-amber-800 ring-amber-300' },
  VERIFIED: { label: 'Verified', className: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
};

export function StatusPill({ status, className }: { status: RequisitionStatus; className?: string }) {
  const style = STYLES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}

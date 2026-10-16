import { Ban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CancellationInfo } from '@/types/requisition';

export function CancelledBadge({ className }: { className?: string }) {
  return (
    <Badge tone="red" className={cn('gap-1', className)}>
      <Ban className="h-3 w-3" /> Cancelled
    </Badge>
  );
}

/** Why and when a requisition was cancelled; renders nothing for an active one. */
export function CancelledNotice({ info, className }: { info: CancellationInfo; className?: string }) {
  if (!info.cancelled_at) return null;
  return (
    <div className={cn('flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800', className)}>
      <Ban className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">
          Cancelled {formatDateTime(info.cancelled_at)}
          {info.cancelled_by_name && ` by ${info.cancelled_by_name}`}
        </p>
        {info.cancel_reason && <p className="break-words">Reason: {info.cancel_reason}</p>}
        <p className="text-xs text-red-700">This requisition is closed and can no longer be changed.</p>
      </div>
    </div>
  );
}

import { Badge } from '@/components/ui/badge';
import { PAYMENT_STATUS_META } from '@/features/requisitions/payment';
import type { PaymentStatus } from '@/types/requisition';

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const meta = PAYMENT_STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

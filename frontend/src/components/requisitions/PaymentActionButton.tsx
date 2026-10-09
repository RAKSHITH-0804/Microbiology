import { Lock, ReceiptIndianRupee, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PaymentStatus } from '@/types/requisition';

export const PAYMENT_LOCKED_HINT = 'Payment locked after report verification. Contact HOD for billing overrides.';

/**
 * Opens the payment dialog. Once a report on the requisition is verified the bill is locked:
 * the HOD gets an override button, everyone else a disabled lock.
 */
export function PaymentActionButton({
  label,
  status,
  locked,
  canOverride,
  onClick,
}: {
  label: string;
  status: PaymentStatus;
  locked: boolean;
  canOverride: boolean;
  onClick: () => void;
}) {
  if (locked && canOverride) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="border-amber-300 text-amber-800 hover:bg-amber-50"
        title="Report verified - change the bill with an audited HOD override"
        onClick={onClick}
      >
        <ShieldAlert /> {label}
        <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold uppercase tracking-wide">HOD Override</span>
      </Button>
    );
  }
  if (locked) {
    return (
      <span title={PAYMENT_LOCKED_HINT}>
        <Button size="sm" variant="outline" disabled aria-label={PAYMENT_LOCKED_HINT}>
          <Lock /> {label}
        </Button>
      </span>
    );
  }
  return (
    <Button
      size="sm"
      variant={status === 'PARTIAL' || status === 'UNPAID' ? 'default' : 'outline'}
      title="Record or correct the payment"
      onClick={onClick}
    >
      <ReceiptIndianRupee /> {label}
    </Button>
  );
}

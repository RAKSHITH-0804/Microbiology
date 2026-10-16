import { toast } from 'sonner';
import { ReasonDialog } from '@/components/ReasonDialog';
import { revokeVerification } from '@/features/reports/api';
import type { ReportType } from '@/types/report';

/** HOD only: returns a verified report to "awaiting verification" and notifies its reporting doctor. */
export function RevokeVerificationDialog({
  open,
  reportType,
  reportId,
  labNo,
  onClose,
  onRevoked,
}: {
  open: boolean;
  reportType: ReportType;
  reportId: number | undefined;
  labNo: string | undefined;
  onClose: () => void;
  onRevoked: () => void;
}) {
  return (
    <ReasonDialog
      open={open && reportId !== undefined}
      title="Revoke Verification"
      description={
        <>
          {reportType === 'general' ? 'General report' : 'Antibiogram report'} for{' '}
          <span className="font-mono font-semibold text-foreground">{labNo}</span>
        </>
      }
      warning="The report goes back to awaiting verification, its signatures are removed from the printout, and the reporting doctor is notified to verify it again."
      confirmLabel="Revoke Verification"
      placeholder="e.g. Organism identification corrected after repeat culture"
      onClose={onClose}
      onConfirm={async (reason) => {
        const res = await revokeVerification(reportType, reportId!, reason);
        toast.success(res.message ?? 'Verification revoked');
        onRevoked();
      }}
    />
  );
}

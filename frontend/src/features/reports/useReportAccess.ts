import { useEffect } from 'react';
import { toast } from 'sonner';
import { NOTHING_TO_PRINT_MESSAGE } from '@/components/reports/ReportPageFrame';
import { useAuth } from '@/context/AuthContext';
import { canUse, hasGrant, MODULE_DISABLED_MESSAGE, REPORT_AUTHOR_ROLES } from '@/layout/navigation';
import type { ReportType, RequisitionDetail } from '@/types/report';
import { logReportPrint } from './api';
import { usePrintOnLoad } from './usePrintOnLoad';

interface Options {
  reportType: ReportType;
  requisition: RequisitionDetail | undefined;
  /** The saved report of this type; undefined/null until it is first saved. */
  report: { is_verified: boolean } | null | undefined;
  /** Unsaved edits on the form. */
  isDirty: boolean;
}

/**
 * Edit and print rules shared by the report entry pages. Verified reports print in full with signatures;
 * saved but unverified reports print as an unsigned draft; nothing prints before the first save.
 * Verified reports are locked, except that the HOD may correct them (which resets verification).
 */
export function useReportAccess({ reportType, requisition, report, isDirty }: Options) {
  const { user } = useAuth();
  const authorRole = !!user && (REPORT_AUTHOR_ROLES.includes(user.role) || hasGrant(user, 'pending_worklist', 'verification'));
  const canAuthor = authorRole && canUse(user, undefined, 'pending_worklist', 'verification');
  const isHod = user?.role === 'HOD';
  const verified = !!report?.is_verified;
  const cancelled = !!requisition?.cancelled_at;
  const locked = requisition?.status === 'VERIFIED' || verified;
  const hodCorrection = locked && isHod && canAuthor && !cancelled;
  const readOnly = cancelled || (locked && !hodCorrection) || !canAuthor;
  const readOnlyMessage = cancelled
    ? 'This requisition was cancelled, so its reports can no longer be edited.'
    : locked && !hodCorrection
      ? 'This report is verified and can no longer be edited.'
      : !authorRole
        ? 'View only: reports are entered by lab technicians and doctors.'
        : !canAuthor
          ? `View only: ${MODULE_DISABLED_MESSAGE}.`
          : null;
  const notice = hodCorrection
    ? 'Verified report: saving a change sends it back to the reporting doctor for re-verification.'
    : null;
  const printable = !!report;
  usePrintOnLoad(!!requisition, printable);

  // Every print (button, ?print=1 or the browser's own Ctrl+P) is recorded in the audit trail.
  const requisitionId = requisition?.id;
  useEffect(() => {
    if (!requisitionId || !printable) return;
    const log = () => void logReportPrint(reportType, requisitionId).catch(() => undefined);
    window.addEventListener('beforeprint', log);
    return () => window.removeEventListener('beforeprint', log);
  }, [reportType, requisitionId, printable]);

  const print = () => {
    if (!printable) toast.error(NOTHING_TO_PRINT_MESSAGE);
    else if (isDirty && !readOnly) toast.error('Save your changes first so the printout matches the saved report');
    else window.print();
  };

  return {
    readOnly,
    readOnlyMessage,
    notice,
    draft: !verified,
    printable,
    print,
    canRevoke: isHod && verified && !cancelled,
  };
}

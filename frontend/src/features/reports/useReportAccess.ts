import { toast } from 'sonner';
import { NOTHING_TO_PRINT_MESSAGE } from '@/components/reports/ReportPageFrame';
import { useAuth } from '@/context/AuthContext';
import { canUse, hasGrant, MODULE_DISABLED_MESSAGE, REPORT_AUTHOR_ROLES } from '@/layout/navigation';
import { usePrintOnLoad } from './usePrintOnLoad';

interface Options {
  loaded: boolean;
  /** The saved report of this type; undefined/null until it is first saved. */
  report: { is_verified: boolean } | null | undefined;
  requisitionVerified: boolean;
  /** Unsaved edits on the form. */
  isDirty: boolean;
}

/**
 * Edit and print rules shared by the report entry pages. Verified reports print in full with signatures;
 * saved but unverified reports print as an unsigned draft; nothing prints before the first save.
 */
export function useReportAccess({ loaded, report, requisitionVerified, isDirty }: Options) {
  const { user } = useAuth();
  const authorRole = !!user && (REPORT_AUTHOR_ROLES.includes(user.role) || hasGrant(user, 'pending_worklist', 'verification'));
  const canAuthor = authorRole && canUse(user, undefined, 'pending_worklist', 'verification');
  const verified = !!report?.is_verified;
  const locked = requisitionVerified || verified;
  const readOnly = locked || !canAuthor;
  const readOnlyMessage = locked
    ? 'This report is verified and can no longer be edited.'
    : !authorRole
      ? 'View only: reports are entered by lab technicians and doctors.'
      : !canAuthor
        ? `View only: ${MODULE_DISABLED_MESSAGE}.`
        : null;
  const printable = !!report;
  usePrintOnLoad(loaded, printable);

  const print = () => {
    if (!printable) toast.error(NOTHING_TO_PRINT_MESSAGE);
    else if (isDirty && !readOnly) toast.error('Save your changes first so the printout matches the saved report');
    else window.print();
  };

  return { readOnly, readOnlyMessage, draft: !verified, printable, print };
}

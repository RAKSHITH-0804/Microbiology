import type { PendingRequisition } from '@/types/requisition';

type ReportRefs = Pick<PendingRequisition, 'id' | 'status' | 'general_report_id' | 'antibiogram_report_id'>;

/** Report page to open for a requisition: the antibiogram if that is the only report entered, else the general report. */
export function primaryReportPath(r: ReportRefs) {
  const type = r.antibiogram_report_id && !r.general_report_id ? 'antibiogram' : 'general';
  return `/reports/${type}/${r.id}`;
}

export function primaryReportLabel(r: ReportRefs) {
  if (r.status === 'RECEIVED') return 'Enter Report';
  if (r.status === 'VERIFIED') return 'View Report';
  return 'Open Report';
}

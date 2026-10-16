import type { PendingRequisition, RequisitionStatus } from './requisition';

export type SensitivityResult = 'S' | 'R' | 'MS';
export type ReportType = 'general' | 'antibiogram';

export const SENSITIVITY_OPTIONS: { value: SensitivityResult; label: string; short: string }[] = [
  { value: 'S', label: 'Sensitive', short: 'S' },
  { value: 'R', label: 'Resistant', short: 'R' },
  { value: 'MS', label: 'Moderately Sensitive', short: 'MS' },
];

export type StaffRole = 'DOCTOR' | 'LAB_TECH' | 'CLERK' | 'OTHER';

export interface MasterStaff {
  id: number;
  name: string;
  designation: string;
  staff_type: 'TEACHING' | 'NON_TEACHING';
  staff_role: StaffRole;
}

export interface MasterOrganism {
  id: number;
  category: string;
  organism_name: string;
}

export interface MasterAntibiotic {
  id: number;
  antibiotic_name: string;
  short_code: string | null;
}

export interface FindingTemplateGroup {
  test_name: string;
  findings: { id: number; finding_text: string }[];
}

interface ReportBase {
  id: number;
  reporting_datetime: string;
  prepared_by: number | null;
  reported_by: number | null;
  is_verified: boolean;
  updated_at: string;
}

export interface GeneralReport extends ReportBase {
  specimen: string | null;
  investigation_done: string | null;
  report_findings: string | null;
}

export interface AntibiogramResult {
  antibiotic_name: string;
  sensitivity_result: SensitivityResult;
}

export type CultureStatus = 'NO_GROWTH' | 'GROWTH';

export interface AntibiogramOrganismBlock {
  organism_name: string;
  results: AntibiogramResult[];
}

/** Canonical multi-organism payload stored in antibiogram_data. */
export interface AntibiogramData {
  culture_status: CultureStatus;
  culture_text: string | null;
  organisms: AntibiogramOrganismBlock[];
}

export interface AntibiogramReport extends ReportBase {
  organism_isolated: string | null;
  grams_stain_remark: string | null;
  /** Normalised culture payload (prefer this over the legacy flat fields). */
  antibiogram_data?: AntibiogramData | null;
  culture_status?: CultureStatus;
  culture_text?: string | null;
  organisms?: AntibiogramOrganismBlock[];
  /** Legacy flat results (first organism) for older readers. */
  results: AntibiogramResult[];
}

export interface RequisitionDetail extends PendingRequisition {
  general_report: GeneralReport | null;
  antibiogram_report: AntibiogramReport | null;
}

export interface GeneralReportPayload {
  requisition_id: number;
  specimen: string | null;
  investigation_done: string | null;
  report_findings: string;
  prepared_by: number;
  reported_by: number;
}

export interface AntibiogramReportPayload {
  requisition_id: number;
  culture_status: CultureStatus;
  culture_text?: string | null;
  grams_stain_remark: string | null;
  /** Required for GROWTH; optional for NO_GROWTH (server may auto-fill from the session). */
  prepared_by: number | null;
  reported_by: number | null;
  organisms: AntibiogramOrganismBlock[];
}

export interface SavedReport {
  id: number;
  requisition_id: number;
  lab_no: string;
  status: string;
  reporting_datetime: string;
  /** The HOD corrected a verified report, so it awaits verification again. */
  verification_reset: boolean;
  /** Set when a NO_GROWTH save auto-verifies the report. */
  is_verified?: boolean;
  /** Requisition status after save (VERIFIED for auto-cleared NO_GROWTH). */
  requisition_status?: string;
}

export interface ReportArchiveParams {
  search?: string;
  type?: ReportType;
  isVerified?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ReportArchiveItem {
  report_type: ReportType;
  report_id: number;
  requisition_id: number;
  reporting_datetime: string;
  /** Investigation done (general) or organism isolated (antibiogram). */
  summary: string | null;
  is_verified: boolean;
  verified_at: string | null;
  created_at: string;
  lab_no: string;
  receipt_no: string | null;
  sample_nature: string | null;
  requisition_status: RequisitionStatus;
  cancelled_at: string | null;
  patient: PendingRequisition['patient'];
  prepared_by_name: string | null;
  reported_by_name: string | null;
  reported_by_designation: string | null;
  verified_by_name: string | null;
}

export interface ReportArchivePage {
  items: ReportArchiveItem[];
  total: number;
  page: number;
  pageSize: number;
}

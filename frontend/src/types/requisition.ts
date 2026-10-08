export const HOSPITALS = ['CGH', 'BH', 'PVT', 'WCH', 'Other'] as const;
export type Hospital = (typeof HOSPITALS)[number];

export type AgeUnit = 'Y' | 'M' | 'D';
export type Sex = 'M' | 'F' | 'Other';
export type RequisitionStatus = 'RECEIVED' | 'REPORT_ENTERED' | 'VERIFIED';

export interface MasterSample {
  id: number;
  sample_name: string;
}

export interface CatalogTest {
  id: number;
  test_name: string;
  template_test_name: string | null;
  has_template: boolean;
}

export interface TestCategory {
  category: string;
  tests: CatalogTest[];
}

export interface RequisitionTestInput {
  test_category: string;
  test_name: string;
}

export interface CreateRequisitionPayload {
  patient: {
    name: string;
    age_years: number | null;
    age_months: number | null;
    age_days: number | null;
    sex: Sex;
    phone: string | null;
  };
  lab_no: string;
  receipt_no: string | null;
  hospital: Hospital;
  hospital_other: string | null;
  consultant_doctor: string | null;
  op_ip_no: string | null;
  ward_unit: string | null;
  clinical_diagnosis: string | null;
  preferred_antibiotics: string | null;
  antibiotics_used: string | null;
  sample_nature: string;
  site_of_collection: string | null;
  sample_collection_datetime: string | null;
  sample_received_datetime: string;
  requisition_tests: RequisitionTestInput[];
}

export interface CreatedRequisition {
  id: number;
  lab_no: string;
  status: RequisitionStatus;
  sample_received_datetime: string;
  patient_id: number;
  patient_created: boolean;
}

export interface UpdatedRequisition {
  id: number;
  lab_no: string;
  status: RequisitionStatus;
  patient_id: number;
}

export interface RequisitionTest extends RequisitionTestInput {
  template_test_name: string | null;
}

export interface PendingRequisition {
  id: number;
  lab_no: string;
  receipt_no: string | null;
  status: RequisitionStatus;
  hospital: string | null;
  consultant_doctor: string | null;
  op_ip_no: string | null;
  ward_unit: string | null;
  clinical_diagnosis: string | null;
  preferred_antibiotics: string | null;
  antibiotics_used: string | null;
  sample_nature: string | null;
  site_of_collection: string | null;
  sample_collection_datetime: string | null;
  sample_received_datetime: string;
  created_at: string;
  patient: {
    id: number;
    name: string;
    age_value: number | null;
    age_unit: AgeUnit;
    age_years: number | null;
    age_months: number | null;
    age_days: number | null;
    sex: Sex | null;
    phone: string | null;
  };
  tests: RequisitionTest[];
  general_report_id: number | null;
  antibiogram_report_id: number | null;
  general_report_verified: boolean | null;
  antibiogram_report_verified: boolean | null;
}

export interface RequisitionListParams {
  search?: string;
  status?: RequisitionStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface RequisitionListPage {
  items: PendingRequisition[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<RequisitionStatus, number>;
}

export interface DashboardStats {
  samplesToday: number;
  pendingReports: number;
  awaitingVerification: number;
  verifiedThisWeek: number;
  recentRequisitions: PendingRequisition[];
}

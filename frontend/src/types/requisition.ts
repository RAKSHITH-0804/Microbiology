export const HOSPITALS = ['CGH', 'BH', 'PVT', 'WCH', 'Other'] as const;
export type Hospital = (typeof HOSPITALS)[number];

export type AgeUnit = 'Y' | 'M' | 'D';
export type Sex = 'M' | 'F' | 'Other';
export type RequisitionStatus = 'RECEIVED' | 'REPORT_ENTERED' | 'VERIFIED';

export const PAYMENT_STATUSES = ['PAID', 'PARTIAL', 'UNPAID', 'HOSPITAL_CREDIT', 'EXEMPT'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'UPI', label: 'UPI' },
  { value: 'HOSPITAL_CREDIT', label: 'Hospital Credit' },
  { value: 'EXEMPT', label: 'Exempt' },
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number]['value'];

export interface PaymentPayload {
  total_amount: number;
  paid_amount: number;
  payment_mode: PaymentMode | null;
  payment_status: PaymentStatus;
  /** Who referred or authorised a fee exemption; null for other modes. */
  exempt_referred_by: string | null;
}

/** What the Update Payment dialog needs, from either the directory or the revenue ledger. */
export interface PaymentTarget {
  id: number;
  lab_no: string;
  patient_name: string;
  total_amount: number;
  paid_amount: number;
  payment_mode: PaymentMode | null;
  payment_status: PaymentStatus;
  exempt_referred_by: string | null;
  /** A verified report locks the bill; only the HOD may override it, with a reason. */
  is_verified: boolean;
}

export interface UpdatedPayment extends PaymentPayload {
  id: number;
  lab_no: string;
  changed: boolean;
}

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

export interface CreateRequisitionPayload extends PaymentPayload {
  address: string | null;
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
  payment_status: PaymentStatus;
  sample_received_datetime: string;
  patient_id: number;
  patient_created: boolean;
}

export interface UpdatedRequisition {
  id: number;
  lab_no: string;
  status: RequisitionStatus;
  payment_status: PaymentStatus;
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
  address: string | null;
  total_amount: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  payment_mode: PaymentMode | null;
  exempt_referred_by: string | null;
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
  /** Lab technician(s) who prepared the report(s), e.g. "A, B"; null before any report. */
  prepared_by_name: string | null;
  /** Reporting doctor(s) named on the report(s); null before any report. */
  reported_by_name: string | null;
}

/** One match on the Status Timeline search. */
export interface StatusSearchResult {
  id: number;
  lab_no: string;
  receipt_no: string | null;
  patient_name: string;
  sample_nature: string | null;
  sample_received_datetime: string;
  status: RequisitionStatus;
  payment_status: PaymentStatus;
}

export interface RequisitionListParams {
  search?: string;
  status?: RequisitionStatus;
  paymentStatus?: PaymentStatus;
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

export interface DashboardAnalytics {
  categoryDistribution: { category: string; count: number }[];
  yearlyComparison: {
    currentYear: number;
    previousYear: number;
    /** Always twelve entries, month 1 (January) to 12. */
    months: { month: number; currentYear: number; previousYear: number }[];
  };
  labTechProductivity: { id: number; name: string; drafted: number; verified: number }[];
  doctorProductivity: { id: number; name: string; verified: number; pending: number }[];
}

export interface DashboardStats {
  samplesToday: number;
  pendingReports: number;
  awaitingVerification: number;
  verifiedThisWeek: number;
  recentRequisitions: PendingRequisition[];
  /** Department-wide charts; only sent to the HOD and Super Admin. */
  analytics: DashboardAnalytics | null;
}

export interface TimelineReport {
  report_type: 'general' | 'antibiogram';
  drafted_at: string;
  is_verified: boolean;
  verified_at: string | null;
  prepared_by_name: string | null;
  reported_by_name: string | null;
  verified_by_name: string | null;
}

export interface RequisitionTimeline {
  id: number;
  lab_no: string;
  status: RequisitionStatus;
  patient_name: string;
  received_at: string;
  received_by: string | null;
  payment_status: PaymentStatus;
  payment_mode: PaymentMode | null;
  exempt_referred_by: string | null;
  total_amount: number;
  paid_amount: number;
  reports: TimelineReport[];
}

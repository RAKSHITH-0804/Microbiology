export const HOSPITALS = ['CGH', 'BH', 'PVT', 'WCH', 'Other'] as const;
export type Hospital = (typeof HOSPITALS)[number];

export type AgeUnit = 'Y' | 'M' | 'D';
export type Sex = 'M' | 'F' | 'Other';
export type RequisitionStatus = 'RECEIVED' | 'REPORT_ENTERED' | 'VERIFIED';

export const PAYMENT_STATUSES = ['PAID', 'PARTIAL', 'UNPAID', 'EXEMPT'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
  { value: 'HOSPITAL_CREDIT', label: 'Hospital Credit / Exempt' },
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number]['value'];

export interface PaymentPayload {
  total_amount: number;
  paid_amount: number;
  payment_mode: PaymentMode | null;
  payment_status: PaymentStatus;
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

export interface DashboardStats {
  samplesToday: number;
  pendingReports: number;
  awaitingVerification: number;
  verifiedThisWeek: number;
  recentRequisitions: PendingRequisition[];
}

import type { PaymentMode, PaymentStatus, RequisitionStatus } from '@/types/requisition';

export interface PaymentFilters {
  startDate?: string;
  endDate?: string;
  paymentMode?: PaymentMode;
  paymentStatus?: PaymentStatus;
}

export interface ModeBreakdown {
  mode: PaymentMode | 'NOT_RECORDED';
  count: number;
  billed: number;
  collected: number;
  balance_due: number;
}

export interface PaymentSummary {
  today_collection: number;
  today_count: number;
  filtered_collection: number;
  filtered_billed: number;
  total_outstanding: number;
  exempt_total: number;
  exempt_count: number;
  transactions: number;
  breakdown_by_mode: ModeBreakdown[];
}

export interface PaymentTransaction {
  id: number;
  lab_no: string;
  created_at: string;
  sample_received_datetime: string;
  status: RequisitionStatus;
  patient_id: number;
  patient_name: string;
  phone: string | null;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  payment_mode: PaymentMode | null;
  payment_status: PaymentStatus;
}

export interface PaymentHistoryPage {
  items: PaymentTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface LedgerVisit extends PaymentTransaction {
  sample_nature: string | null;
}

export interface PatientLedger {
  patients: { id: number; name: string; phone: string | null }[];
  total_visits: number;
  lifetime_billed: number;
  lifetime_paid: number;
  lifetime_balance_due: number;
  visits: LedgerVisit[];
  suggestions: { id: number; name: string; phone: string | null; visits: number }[];
}

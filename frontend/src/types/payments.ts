import type { PaymentMode, PaymentStatus, RequisitionStatus } from '@/types/requisition';

/** Every amount in these responses is integer paise. */

export interface PaymentFilters {
  startDate?: string;
  endDate?: string;
  paymentMode?: PaymentMode;
  paymentStatus?: PaymentStatus;
}

export interface ModeBreakdown {
  mode: PaymentMode | 'NOT_RECORDED';
  count: number;
  billed_paise: number;
  collected_paise: number;
  balance_due_paise: number;
}

export interface PaymentSummary {
  today_collection_paise: number;
  today_count: number;
  filtered_collection_paise: number;
  filtered_billed_paise: number;
  total_outstanding_paise: number;
  hospital_credit_total_paise: number;
  hospital_credit_count: number;
  exempt_total_paise: number;
  exempt_count: number;
  transactions: number;
  breakdown_by_mode: ModeBreakdown[];
}

export interface PaymentTransaction {
  id: number;
  lab_no: string;
  receipt_no: string | null;
  created_at: string;
  sample_received_datetime: string;
  status: RequisitionStatus;
  cancelled_at: string | null;
  patient_id: number;
  patient_name: string;
  phone: string | null;
  sample_nature: string | null;
  /** Comma-separated investigation names from the requisition. */
  investigations: string;
  total_amount_paise: number;
  paid_amount_paise: number;
  balance_due_paise: number;
  payment_mode: PaymentMode | null;
  payment_status: PaymentStatus;
  exempt_referred_by: string | null;
  /** A verified report locks the bill against further changes. */
  is_verified: boolean;
}

export interface PaymentHistoryPage {
  items: PaymentTransaction[];
  total: number;
  page: number;
  limit: number;
}

export type LedgerVisit = PaymentTransaction;

export interface PatientLedger {
  patients: { id: number; name: string; phone: string | null }[];
  total_visits: number;
  lifetime_billed_paise: number;
  lifetime_paid_paise: number;
  lifetime_balance_due_paise: number;
  visits: LedgerVisit[];
  suggestions: { id: number; name: string; phone: string | null; visits: number }[];
}

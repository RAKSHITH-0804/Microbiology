import { api, ApiResponse } from '@/lib/api';
import type { PatientLedger, PaymentFilters, PaymentHistoryPage, PaymentSummary } from '@/types/payments';

export async function fetchPaymentSummary(params: PaymentFilters): Promise<PaymentSummary> {
  const res = await api.get<ApiResponse<PaymentSummary>>('/payments/summary', { params });
  return res.data.data;
}

export async function fetchPaymentHistory(
  params: PaymentFilters & { search?: string; page?: number; limit?: number },
): Promise<PaymentHistoryPage> {
  const res = await api.get<ApiResponse<PaymentHistoryPage>>('/payments/history', { params });
  return res.data.data;
}

export async function fetchPatientLedger(params: { phone_no?: string; patient_name?: string }): Promise<PatientLedger> {
  const res = await api.get<ApiResponse<PatientLedger>>('/payments/patient-ledger', { params });
  return res.data.data;
}

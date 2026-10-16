import { api, ApiResponse } from '@/lib/api';
import type {
  CreatedRequisition,
  CreateRequisitionPayload,
  DashboardStats,
  MasterSample,
  PaymentPayload,
  PendingRequisition,
  RequisitionListPage,
  RequisitionTimeline,
  StatusSearchResult,
  RequisitionListParams,
  TestCategory,
  UpdatedPayment,
  UpdatedRequisition,
} from '@/types/requisition';

export async function fetchSamples(): Promise<MasterSample[]> {
  const res = await api.get<ApiResponse<MasterSample[]>>('/master/samples');
  return res.data.data;
}

export async function fetchTestCatalog(): Promise<TestCategory[]> {
  const res = await api.get<ApiResponse<TestCategory[]>>('/master/test-catalog');
  return res.data.data;
}

export async function createRequisition(payload: CreateRequisitionPayload): Promise<CreatedRequisition> {
  const res = await api.post<ApiResponse<CreatedRequisition>>('/requisitions', payload);
  return res.data.data;
}

export async function updateRequisition(id: number, payload: CreateRequisitionPayload): Promise<UpdatedRequisition> {
  const res = await api.put<ApiResponse<UpdatedRequisition>>(`/requisitions/${id}`, payload);
  return res.data.data;
}

/** `reason` is required when the HOD overrides the bill of a verified requisition, or a fully paid bill is reduced. */
export async function updatePayment(id: number, payload: PaymentPayload, reason?: string): Promise<UpdatedPayment> {
  const res = await api.patch<ApiResponse<UpdatedPayment>>(`/requisitions/${id}/payment`, { ...payload, reason });
  return res.data.data;
}

/** HOD or Super Admin; once a report is verified, the HOD only. */
export async function cancelRequisition(id: number, reason: string) {
  return (await api.post<ApiResponse<{ lab_no: string }>>(`/requisitions/${id}/cancel`, { reason })).data;
}

export async function fetchPendingRequisitions(): Promise<PendingRequisition[]> {
  const res = await api.get<ApiResponse<PendingRequisition[]>>('/requisitions/pending');
  return res.data.data;
}

export async function fetchRequisitions(params: RequisitionListParams): Promise<RequisitionListPage> {
  const res = await api.get<ApiResponse<RequisitionListPage>>('/requisitions', { params });
  return res.data.data;
}

export async function searchRequisitionStatus(q: string): Promise<StatusSearchResult[]> {
  const res = await api.get<ApiResponse<StatusSearchResult[]>>('/requisitions/status-search', { params: q ? { q } : {} });
  return res.data.data;
}

export async function fetchRequisitionTimeline(id: number): Promise<RequisitionTimeline> {
  const res = await api.get<ApiResponse<RequisitionTimeline>>(`/requisitions/${id}/timeline`);
  return res.data.data;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await api.get<ApiResponse<DashboardStats>>('/dashboard/stats');
  return res.data.data;
}

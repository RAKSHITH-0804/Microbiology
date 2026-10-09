import { api, ApiResponse } from '@/lib/api';
import type {
  CreatedRequisition,
  CreateRequisitionPayload,
  DashboardStats,
  MasterSample,
  PaymentPayload,
  PendingRequisition,
  RequisitionListPage,
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

export async function updatePayment(id: number, payload: PaymentPayload): Promise<UpdatedPayment> {
  const res = await api.patch<ApiResponse<UpdatedPayment>>(`/requisitions/${id}/payment`, payload);
  return res.data.data;
}

export async function fetchPendingRequisitions(): Promise<PendingRequisition[]> {
  const res = await api.get<ApiResponse<PendingRequisition[]>>('/requisitions/pending');
  return res.data.data;
}

export async function fetchRequisitions(params: RequisitionListParams): Promise<RequisitionListPage> {
  const res = await api.get<ApiResponse<RequisitionListPage>>('/requisitions', { params });
  return res.data.data;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await api.get<ApiResponse<DashboardStats>>('/dashboard/stats');
  return res.data.data;
}

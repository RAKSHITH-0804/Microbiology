import { api, ApiResponse } from '@/lib/api';
import type {
  AppUser,
  AuditLogFilters,
  AuditLogPage,
  BulkVerifyResult,
  CreateUserPayload,
  MasterEntityKey,
  MasterRow,
  UnverifiedReport,
  VerifiedReport,
} from '@/types/admin';
import type { ReportType } from '@/types/report';

export async function fetchUnverifiedReports(): Promise<UnverifiedReport[]> {
  const res = await api.get<ApiResponse<UnverifiedReport[]>>('/reports/unverified');
  return res.data.data;
}

export async function verifyReport(type: ReportType, id: number): Promise<VerifiedReport> {
  const res = await api.post<ApiResponse<VerifiedReport>>(`/reports/${type}/${id}/verify`);
  return res.data.data;
}

export async function setReviewMark(
  type: ReportType,
  id: number,
  checked: boolean,
): Promise<{ report_type: ReportType; report_id: number; reviewed: boolean }> {
  const res = await api.put<ApiResponse<{ report_type: ReportType; report_id: number; reviewed: boolean }>>(
    `/reports/${type}/${id}/review-mark`,
    { checked },
  );
  return res.data.data;
}

export async function bulkVerifyReports(reports: { type: ReportType; id: number }[]): Promise<BulkVerifyResult> {
  const res = await api.post<ApiResponse<BulkVerifyResult>>('/reports/bulk-verify', { reports });
  return res.data.data;
}

export async function clearReviewMarks(): Promise<{ cleared: number }> {
  const res = await api.delete<ApiResponse<{ cleared: number }>>('/reports/review-marks');
  return res.data.data;
}

export async function selectAllReviewMarks(): Promise<{ marked: number }> {
  const res = await api.post<ApiResponse<{ marked: number }>>('/reports/review-marks/select-all');
  return res.data.data;
}

export async function fetchUsers(): Promise<AppUser[]> {
  const res = await api.get<ApiResponse<AppUser[]>>('/users');
  return res.data.data;
}

export async function createUser(payload: CreateUserPayload): Promise<AppUser> {
  const res = await api.post<ApiResponse<AppUser>>('/users', payload);
  return res.data.data;
}

export async function setUserActive(id: number, isActive: boolean): Promise<AppUser> {
  const res = await api.patch<ApiResponse<AppUser>>(`/users/${id}/status`, { is_active: isActive });
  return res.data.data;
}

export async function resetUserPassword(id: number, password: string): Promise<AppUser> {
  const res = await api.post<ApiResponse<AppUser>>(`/users/${id}/reset-password`, { password });
  return res.data.data;
}

export async function deleteUser(id: number): Promise<{ message: string; staffDeleted: boolean }> {
  const res = await api.delete<ApiResponse<{ id: number; username: string; staff_deleted: boolean }>>(`/users/${id}`);
  return { message: res.data.message ?? 'User account deleted successfully', staffDeleted: res.data.data.staff_deleted };
}

export async function fetchMasterRows(entity: MasterEntityKey): Promise<MasterRow[]> {
  const res = await api.get<ApiResponse<MasterRow[]>>(`/master/${entity}`, { params: { include_inactive: 'true' } });
  return res.data.data;
}

export async function createMasterRow(entity: MasterEntityKey, values: Record<string, string | null>): Promise<MasterRow> {
  const res = await api.post<ApiResponse<MasterRow>>(`/master/${entity}`, values);
  return res.data.data;
}

export async function updateMasterRow(
  entity: MasterEntityKey,
  id: number,
  values: Record<string, string | null | boolean>,
): Promise<MasterRow> {
  const res = await api.put<ApiResponse<MasterRow>>(`/master/${entity}/${id}`, values);
  return res.data.data;
}

export async function deactivateMasterRow(entity: MasterEntityKey, id: number): Promise<MasterRow> {
  const res = await api.delete<ApiResponse<MasterRow>>(`/master/${entity}/${id}`);
  return res.data.data;
}

export async function fetchAuditLogs(filters: AuditLogFilters): Promise<AuditLogPage> {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''));
  const res = await api.get<ApiResponse<AuditLogPage>>('/audit-logs', { params });
  return res.data.data;
}

/** Field errors from a 400/409 response, keyed by field name. */
export function fieldErrors(err: unknown): Record<string, string> {
  const errors = (err as { response?: { data?: { errors?: unknown } } }).response?.data?.errors;
  if (!errors || typeof errors !== 'object') return {};
  return Object.fromEntries(
    Object.entries(errors as Record<string, string[] | string>).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)]),
  );
}

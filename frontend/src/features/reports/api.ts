import { api, ApiResponse } from '@/lib/api';
import type {
  AntibiogramReportPayload,
  FindingTemplateGroup,
  GeneralReportPayload,
  MasterAntibiotic,
  MasterOrganism,
  MasterStaff,
  ReportArchivePage,
  ReportArchiveParams,
  ReportType,
  RequisitionDetail,
  SavedReport,
} from '@/types/report';

const get = async <T>(url: string) => (await api.get<ApiResponse<T>>(url)).data.data;

export const fetchRequisition = (id: number) => get<RequisitionDetail>(`/requisitions/${id}`);
export const fetchStaff = () => get<MasterStaff[]>('/master/staff');
export const fetchOrganisms = () => get<MasterOrganism[]>('/master/organisms');
export const fetchAntibiotics = () => get<MasterAntibiotic[]>('/master/antibiotics');
export const fetchFindingTemplates = () => get<FindingTemplateGroup[]>('/master/findings');

export async function saveGeneralReport(payload: GeneralReportPayload): Promise<SavedReport> {
  return (await api.post<ApiResponse<SavedReport>>('/reports/general', payload)).data.data;
}

export async function fetchReportArchive(params: ReportArchiveParams): Promise<ReportArchivePage> {
  return (await api.get<ApiResponse<ReportArchivePage>>('/reports', { params })).data.data;
}

export async function saveAntibiogramReport(payload: AntibiogramReportPayload): Promise<SavedReport> {
  return (await api.post<ApiResponse<SavedReport>>('/reports/antibiogram', payload)).data.data;
}

/** HOD only: sends a verified report back to its reporting doctor. */
export async function revokeVerification(type: ReportType, reportId: number, reason: string) {
  return (await api.post<ApiResponse<{ lab_no: string }>>(`/reports/${type}/${reportId}/revoke`, { reason })).data;
}

/** Records a print in the audit trail; the server decides whether it was a draft. */
export async function logReportPrint(type: ReportType, requisitionId: number) {
  await api.post(`/reports/${type}/${requisitionId}/print-log`);
}

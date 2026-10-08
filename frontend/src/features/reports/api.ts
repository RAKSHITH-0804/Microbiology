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

import type { UserRole } from './auth';
import type { PendingRequisition } from './requisition';
import type { ReportType } from './report';

export interface UnverifiedReport {
  report_type: ReportType;
  report_id: number;
  requisition_id: number;
  reporting_datetime: string;
  lab_no: string;
  receipt_no: string | null;
  sample_nature: string | null;
  hospital: string | null;
  patient: PendingRequisition['patient'];
  prepared_by: number | null;
  prepared_by_name: string | null;
  reported_by: number | null;
  reported_by_name: string | null;
  reported_by_designation: string | null;
}

export interface VerifiedReport {
  report_type: ReportType;
  report_id: number;
  requisition_id: number;
  lab_no: string;
  requisition_status: string;
  verified_at: string;
}

export interface AppUser {
  id: number;
  username: string;
  role: UserRole;
  is_active: boolean;
  staff_id: number | null;
  staff_name: string | null;
  designation: string | null;
  staff_type: 'TEACHING' | 'NON_TEACHING' | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  /** Registered requisitions or prepared / reported / verified reports; such accounts can only be disabled. */
  has_clinical_records: boolean;
  /** Still on an initial or temporary password. */
  must_change_password: boolean;
  /** Submitted "Forgot Password?" from the login page and is waiting for a temporary password. */
  password_reset_requested: boolean;
  password_reset_requested_at: string | null;
}

export type StaffType = 'TEACHING' | 'NON_TEACHING';

interface CreateUserBase {
  username: string;
  /** Omitted: the account starts on the default staff password. */
  password?: string;
  role: UserRole;
}

/** Either link an existing staff member or register a newly joined one. */
export type CreateUserPayload =
  | (CreateUserBase & { staff_id: number })
  | (CreateUserBase & { staff_type: StaffType; name: string; designation: string });

export type MasterEntityKey = 'organisms' | 'antibiotics' | 'samples' | 'templates';

/** A master-data row; the data columns depend on the entity. */
export interface MasterRow {
  id: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  [column: string]: string | number | boolean | null;
}

export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  username: string | null;
  staff_name: string | null;
  role: UserRole | null;
  action: string;
  entity_name: string;
  entity_id: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
  actions: string[];
  entities: string[];
}

export interface AuditLogFilters {
  search?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
  page: number;
  page_size: number;
}

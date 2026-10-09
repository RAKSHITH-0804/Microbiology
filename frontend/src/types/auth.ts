export type UserRole = 'SUPER_ADMIN' | 'HOD' | 'DOCTOR' | 'LAB_TECH' | 'CLERK';

export const MODULE_KEYS = [
  'new_requisition',
  'pending_worklist',
  'requisitions',
  'reports',
  'verification',
  'billing',
  'status_timeline',
  'master_data',
  'users',
  'audit_logs',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  new_requisition: 'New Requisition',
  pending_worklist: 'Pending Worklist',
  requisitions: 'Requisitions',
  reports: 'Reports',
  verification: 'Verification',
  billing: 'Billing',
  status_timeline: 'Status Timeline',
  master_data: 'Master Data',
  users: 'Users',
  audit_logs: 'Audit Logs',
};

export interface User {
  id: number;
  username: string;
  role: UserRole;
  staffId: number | null;
  name: string;
  designation: string | null;
  /** Still on the temporary password issued by the administrator; every page stays blocked until it is replaced. */
  mustChangePassword: boolean;
  /** Modules the Super Admin has switched off for this account. */
  disabledModules: ModuleKey[];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  HOD: 'Head of Department',
  DOCTOR: 'Doctor',
  LAB_TECH: 'Lab Technician',
  CLERK: 'Clerk',
};

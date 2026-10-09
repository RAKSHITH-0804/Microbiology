import { UserRole } from '../../utils/jwt';

/** Module keys stored in user_permissions (mirrors the CHECK constraint, last changed in migration 013). */
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

/**
 * Modules each role can reach at all. A user_permissions row can only switch a module off within
 * this ceiling; it never grants a module the role lacks.
 */
export const ROLE_MODULES: Record<UserRole, readonly ModuleKey[]> = {
  SUPER_ADMIN: [
    'new_requisition',
    'pending_worklist',
    'requisitions',
    'reports',
    'billing',
    'status_timeline',
    'master_data',
    'users',
    'audit_logs',
  ],
  HOD: ['new_requisition', 'pending_worklist', 'requisitions', 'reports', 'verification', 'billing', 'status_timeline'],
  LAB_TECH: ['new_requisition', 'pending_worklist', 'requisitions', 'reports', 'billing', 'status_timeline'],
  DOCTOR: ['pending_worklist', 'requisitions', 'reports', 'verification', 'status_timeline'],
  CLERK: ['new_requisition', 'reports', 'status_timeline'],
};

/** Super Admin access is never restricted, so the matrix can always be reopened. */
export const isRestrictable = (role: UserRole) => role !== 'SUPER_ADMIN';

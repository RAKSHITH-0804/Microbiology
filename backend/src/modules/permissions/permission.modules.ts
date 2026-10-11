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
 * Modules each role starts with. A user_permissions row overrides this per user in either direction:
 * is_enabled = FALSE switches a default module off, TRUE grants a module the role does not have.
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

/** Columns listing the user's override rows: `enabled_modules` (grants) and `disabled_modules` (revocations). */
export const MODULE_OVERRIDES_SQL = (userIdSql: string) => `
  ARRAY(SELECT p.module_key::text FROM user_permissions p WHERE p.user_id = ${userIdSql} AND p.is_enabled ORDER BY p.module_key) AS enabled_modules,
  ARRAY(SELECT p.module_key::text FROM user_permissions p WHERE p.user_id = ${userIdSql} AND NOT p.is_enabled ORDER BY p.module_key) AS disabled_modules`;

export interface ResolvedModules {
  /** Every module the user can open. */
  modules: ModuleKey[];
  /** The subset granted beyond the role's defaults. */
  granted: ModuleKey[];
}

/** Applies a user's override rows to the role defaults. Super Admin overrides are ignored. */
export function resolveModules(role: UserRole, enabledRows: readonly string[], disabledRows: readonly string[]): ResolvedModules {
  const defaults = ROLE_MODULES[role] ?? [];
  if (!isRestrictable(role)) return { modules: [...defaults], granted: [] };
  const modules = MODULE_KEYS.filter(
    (m) => !disabledRows.includes(m) && (defaults.includes(m) || enabledRows.includes(m)),
  );
  return { modules, granted: modules.filter((m) => !defaults.includes(m)) };
}

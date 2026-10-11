import {
  Activity,
  ClipboardList,
  Database,
  FilePlus2,
  FileText,
  History,
  IndianRupee,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LucideIcon,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { ModuleKey, User, UserRole } from '@/types/auth';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles?: UserRole[];
  /** Per-user switch in the permission matrix; the item disappears when the Super Admin turns it off. */
  module?: ModuleKey;
  /** Toast shown when a user outside `roles` opens the page directly. */
  deniedMessage?: string;
  /** Match only the exact path, not its children. */
  end?: boolean;
  /** Extra path prefixes that should also mark this item active. */
  alsoActiveFor?: string[];
}

/** Roles allowed into billing; mirrors REVENUE_ROLES on the API. */
export const REVENUE_ROLES: UserRole[] = ['SUPER_ADMIN', 'HOD', 'LAB_TECH'];

/** Roles that register requisitions; mirrors requireRequisitionEntry on the API. */
export const REQUISITION_ENTRY_ROLES: UserRole[] = ['SUPER_ADMIN', 'HOD', 'LAB_TECH', 'CLERK'];
export const REQUISITION_ENTRY_DENIED = 'Access restricted: Requisition entry is managed by lab desk staff.';

/** Roles that may modify a registered requisition; mirrors requireRequisitionEdit on the API. */
export const REQUISITION_EDIT_ROLES: UserRole[] = ['SUPER_ADMIN', 'HOD', 'LAB_TECH'];

/** Roles with the worklist and requisition directory; mirrors requireRequisitionBrowse on the API. */
export const REQUISITION_BROWSE_ROLES: UserRole[] = ['SUPER_ADMIN', 'HOD', 'LAB_TECH', 'DOCTOR'];

/** Roles that enter report findings; mirrors the report save routes on the API. */
export const REPORT_AUTHOR_ROLES: UserRole[] = ['HOD', 'LAB_TECH', 'DOCTOR'];

export const MODULE_DISABLED_MESSAGE = 'Module access disabled by Super Admin';

/** Compulsory screen for accounts still on an initial or temporary password; every other page redirects here. */
export const CHANGE_PASSWORD_PATH = '/change-password';

const SUPER_ADMIN_ONLY: UserRole[] = ['SUPER_ADMIN'];
const SUPER_ADMIN_DENIED = 'Access restricted: This module is managed by the Super Admin.';

/** True unless the Super Admin switched every one of `modules` off for this user. */
export function hasModule(user: User | null, ...modules: ModuleKey[]): boolean {
  return !!user && modules.some((m) => !user.disabledModules.includes(m));
}

/** Role allows it and (when it is a switchable module) the per-user switch is on. */
export function canUse(user: User | null, roles: UserRole[] | undefined, ...modules: ModuleKey[]): boolean {
  if (!user) return false;
  if (roles && !roles.includes(user.role)) return false;
  return modules.length === 0 || hasModule(user, ...modules);
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true, alsoActiveFor: ['/dashboard'] },
  {
    label: 'New Requisition',
    to: '/requisition/new',
    icon: FilePlus2,
    roles: REQUISITION_ENTRY_ROLES,
    module: 'new_requisition',
    deniedMessage: REQUISITION_ENTRY_DENIED,
  },
  {
    label: 'Pending Worklist',
    to: '/worklist',
    icon: ListChecks,
    roles: REQUISITION_BROWSE_ROLES,
    module: 'pending_worklist',
    alsoActiveFor: ['/reports/general/', '/reports/antibiogram/', '/requisition/edit/'],
  },
  { label: 'Requisitions', to: '/requisitions', icon: ClipboardList, roles: REQUISITION_BROWSE_ROLES, module: 'requisitions' },
  { label: 'Status Timeline', to: '/status', icon: Activity, module: 'status_timeline' },
  { label: 'Reports', to: '/reports', icon: FileText, end: true, module: 'reports' },
  { label: 'Billing & Revenue', to: '/payments', icon: IndianRupee, roles: REVENUE_ROLES, module: 'billing' },
  { label: 'Verification', to: '/verification', icon: ShieldCheck, roles: ['HOD', 'DOCTOR'], module: 'verification' },
  {
    label: 'Master Data',
    to: '/master-data',
    icon: Database,
    roles: SUPER_ADMIN_ONLY,
    module: 'master_data',
    deniedMessage: SUPER_ADMIN_DENIED,
  },
  { label: 'Users', to: '/users', icon: Users, roles: SUPER_ADMIN_ONLY, module: 'users', deniedMessage: SUPER_ADMIN_DENIED },
  {
    label: 'Roles & Permissions',
    to: '/admin/roles',
    icon: KeyRound,
    roles: SUPER_ADMIN_ONLY,
    deniedMessage: SUPER_ADMIN_DENIED,
  },
  {
    label: 'Audit Logs',
    to: '/audit-logs',
    icon: History,
    roles: SUPER_ADMIN_ONLY,
    module: 'audit_logs',
    deniedMessage: SUPER_ADMIN_DENIED,
  },
];

export const canSeeNavItem = (user: User | null, item: NavItem) =>
  canUse(user, item.roles, ...(item.module ? [item.module] : []));

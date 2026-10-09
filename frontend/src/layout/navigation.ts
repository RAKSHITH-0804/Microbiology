import {
  ClipboardList,
  Database,
  FilePlus2,
  FileText,
  History,
  IndianRupee,
  LayoutDashboard,
  ListChecks,
  LucideIcon,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { UserRole } from '@/types/auth';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles?: UserRole[];
  /** Toast shown when a user outside `roles` opens the page directly. */
  deniedMessage?: string;
  /** Match only the exact path, not its children. */
  end?: boolean;
  /** Extra path prefixes that should also mark this item active. */
  alsoActiveFor?: string[];
}

/** Roles allowed into billing; mirrors REVENUE_ROLES on the API. */
export const REVENUE_ROLES: UserRole[] = ['HOD', 'LAB_TECH'];

/** Roles that register and edit requisitions; mirrors requireRequisitionEntry on the API. */
export const REQUISITION_ENTRY_ROLES: UserRole[] = ['HOD', 'LAB_TECH'];
export const REQUISITION_ENTRY_DENIED = 'Access restricted: Requisition entry is managed by lab desk staff.';

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true, alsoActiveFor: ['/dashboard'] },
  {
    label: 'New Requisition',
    to: '/requisition/new',
    icon: FilePlus2,
    roles: REQUISITION_ENTRY_ROLES,
    deniedMessage: REQUISITION_ENTRY_DENIED,
  },
  {
    label: 'Pending Worklist',
    to: '/worklist',
    icon: ListChecks,
    alsoActiveFor: ['/reports/general/', '/reports/antibiogram/', '/requisition/edit/'],
  },
  { label: 'Requisitions', to: '/requisitions', icon: ClipboardList },
  { label: 'Reports', to: '/reports', icon: FileText, end: true },
  { label: 'Billing & Revenue', to: '/payments', icon: IndianRupee, roles: REVENUE_ROLES },
  { label: 'Verification', to: '/verification', icon: ShieldCheck, roles: ['HOD', 'DOCTOR'] },
  { label: 'Master Data', to: '/master-data', icon: Database, roles: ['HOD'] },
  { label: 'Users', to: '/users', icon: Users, roles: ['HOD'] },
  { label: 'Audit Logs', to: '/audit-logs', icon: History, roles: ['HOD'] },
];

import {
  ClipboardList,
  Database,
  FilePlus2,
  FileText,
  History,
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
  /** Match only the exact path, not its children. */
  end?: boolean;
  /** Extra path prefixes that should also mark this item active. */
  alsoActiveFor?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true, alsoActiveFor: ['/dashboard'] },
  { label: 'New Requisition', to: '/requisition/new', icon: FilePlus2 },
  {
    label: 'Pending Worklist',
    to: '/worklist',
    icon: ListChecks,
    alsoActiveFor: ['/reports/general/', '/reports/antibiogram/', '/requisition/edit/'],
  },
  { label: 'Requisitions', to: '/requisitions', icon: ClipboardList },
  { label: 'Reports', to: '/reports', icon: FileText, end: true },
  { label: 'Verification', to: '/verification', icon: ShieldCheck, roles: ['HOD', 'DOCTOR'] },
  { label: 'Master Data', to: '/master-data', icon: Database, roles: ['HOD'] },
  { label: 'Users', to: '/users', icon: Users, roles: ['HOD'] },
  { label: 'Audit Logs', to: '/audit-logs', icon: History, roles: ['HOD'] },
];

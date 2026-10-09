import { Badge, type BadgeProps } from '@/components/ui/badge';
import { ROLE_LABELS, type UserRole } from '@/types/auth';

export const ROLE_TONE: Record<UserRole, BadgeProps['tone']> = {
  SUPER_ADMIN: 'red',
  HOD: 'violet',
  DOCTOR: 'blue',
  LAB_TECH: 'emerald',
  CLERK: 'amber',
};

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  return (
    <Badge tone={ROLE_TONE[role]} title={ROLE_LABELS[role]} className={className}>
      {role}
    </Badge>
  );
}

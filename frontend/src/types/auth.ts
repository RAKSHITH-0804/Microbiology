export type UserRole = 'HOD' | 'DOCTOR' | 'LAB_TECH';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  staffId: number | null;
  name: string;
  designation: string | null;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  HOD: 'Head of Department',
  DOCTOR: 'Doctor',
  LAB_TECH: 'Lab Technician',
};

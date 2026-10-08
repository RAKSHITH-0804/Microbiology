export type UserRole = 'HOD' | 'DOCTOR' | 'LAB_TECH';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  staffId: number | null;
  name: string;
  designation: string | null;
  /** Still on the temporary password issued by the HOD; every page stays blocked until it is replaced. */
  mustChangePassword: boolean;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  HOD: 'Head of Department',
  DOCTOR: 'Doctor',
  LAB_TECH: 'Lab Technician',
};

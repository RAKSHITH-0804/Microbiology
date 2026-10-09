import { api, ApiResponse } from '@/lib/api';
import type { ModuleKey, UserRole } from '@/types/auth';

export interface ModuleState {
  /** The user's role can use this module at all. */
  allowed: boolean;
  /** Allowed and not switched off by the Super Admin. */
  enabled: boolean;
}

export interface PermissionUser {
  id: number;
  username: string;
  name: string;
  designation: string | null;
  staff_type: 'TEACHING' | 'NON_TEACHING' | null;
  role: UserRole;
  /** False for Super Admin accounts, whose access cannot be reduced. */
  restrictable: boolean;
  permissions: Record<ModuleKey, ModuleState>;
}

export interface PermissionMatrix {
  modules: ModuleKey[];
  users: PermissionUser[];
}

export async function fetchPermissionMatrix(): Promise<PermissionMatrix> {
  const res = await api.get<ApiResponse<PermissionMatrix>>('/permissions');
  return res.data.data;
}

export async function updatePermission(userId: number, moduleKey: ModuleKey, isEnabled: boolean): Promise<PermissionUser> {
  const res = await api.put<ApiResponse<PermissionUser>>(`/permissions/${userId}`, {
    module_key: moduleKey,
    is_enabled: isEnabled,
  });
  return res.data.data;
}

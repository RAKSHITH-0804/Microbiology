import { api, ApiResponse } from '@/lib/api';
import type { ModuleKey, UserRole } from '@/types/auth';

export interface ModuleState {
  /** The switch can be changed (every module, except on Super Admin accounts). */
  allowed: boolean;
  /** The user can open the module. */
  enabled: boolean;
  /** In the role's default set; enabled without it means an explicit grant. */
  role_default: boolean;
}

export interface PermissionUser {
  id: number;
  username: string;
  name: string;
  designation: string | null;
  staff_type: 'TEACHING' | 'NON_TEACHING' | null;
  role: UserRole;
  /** False for Super Admin accounts, whose access cannot be changed. */
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

/** Grant All (true) or Revoke All (false) for one account. */
export async function setAllPermissions(userId: number, isEnabled: boolean): Promise<{ user: PermissionUser; message: string }> {
  const res = await api.put<ApiResponse<PermissionUser>>(`/permissions/${userId}/all`, { is_enabled: isEnabled });
  return { user: res.data.data, message: res.data.message ?? '' };
}

/** Every module for every active staff account; returns the refreshed matrix. */
export async function setAllPermissionsForEveryone(isEnabled: boolean): Promise<{ matrix: PermissionMatrix; message: string }> {
  const res = await api.put<ApiResponse<PermissionMatrix>>('/permissions/all', { is_enabled: isEnabled });
  return { matrix: res.data.data, message: res.data.message ?? '' };
}

import { api, ApiResponse } from '@/lib/api';
import type { User } from '@/types/auth';
import type { SessionInfo, SystemSettings } from '@/types/settings';

export async function fetchSettings(): Promise<SystemSettings> {
  const res = await api.get<ApiResponse<SystemSettings>>('/settings');
  return res.data.data;
}

export async function fetchSession(): Promise<SessionInfo> {
  const res = await api.get<ApiResponse<{ user: User; session: SessionInfo }>>('/auth/me');
  return res.data.data.session;
}

/** Files a reset request for the Super Admin; succeeds the same way whether or not the account exists. */
export async function requestPasswordReset(username: string): Promise<void> {
  await api.post('/auth/forgot-password', { username });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post('/auth/change-password', { currentPassword, newPassword });
}

import { api, ApiResponse } from '@/lib/api';
import type { AppNotification } from '@/types/notification';

/** Fired after an action that may close or create notifications, so the header bell refreshes at once. */
export const NOTIFICATIONS_CHANGED = 'jjm-micro:notifications-changed';

export async function fetchNotifications(): Promise<AppNotification[]> {
  const res = await api.get<ApiResponse<AppNotification[]>>('/notifications');
  return res.data.data;
}

export async function markNotificationRead(id: number): Promise<AppNotification> {
  const res = await api.patch<ApiResponse<AppNotification>>(`/notifications/${id}/read`);
  return res.data.data;
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch('/notifications/read-all');
}

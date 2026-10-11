export const NOTIFICATION_TYPES = ['PASSWORD_RESET', 'SYSTEM_UPDATE', 'ALERT', 'GENERAL'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  type: NotificationType;
  /** In-app path the notification opens, e.g. "/users". */
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

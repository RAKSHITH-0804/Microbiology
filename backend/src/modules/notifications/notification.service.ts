import { PoolClient } from 'pg';

export const NOTIFICATION_TYPES = ['PASSWORD_RESET', 'SYSTEM_UPDATE', 'ALERT', 'GENERAL'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NewNotification {
  type: NotificationType;
  title: string;
  message: string;
  /** In-app path the notification opens, e.g. "/users". */
  link?: string | null;
  /** Record the notification is about; open notifications for it are closed together once it is dealt with. */
  entityName?: string;
  entityId?: number;
}

/** Active accounts that can act in User Management: the Super Admin and anyone granted the Users module. */
const USER_MANAGERS_SQL = `
  SELECT u.id FROM users u
  WHERE u.is_active
    AND (u.role = 'SUPER_ADMIN'
         OR EXISTS (SELECT 1 FROM user_permissions p WHERE p.user_id = u.id AND p.module_key = 'users' AND p.is_enabled))`;

/** Sends one notification to every user manager. Returns the number of recipients. */
export async function notifyUserManagers(client: PoolClient, n: NewNotification): Promise<number> {
  const { rowCount } = await client.query(
    `INSERT INTO notifications (recipient_id, type, title, message, link, entity_name, entity_id)
     SELECT m.id, $1, $2, $3, $4, $5, $6 FROM (${USER_MANAGERS_SQL}) m`,
    [n.type, n.title, n.message, n.link ?? null, n.entityName ?? null, n.entityId ?? null],
  );
  return rowCount ?? 0;
}

/** Sends one notification to the active accounts linked to the given staff members (e.g. a reporting doctor). */
export async function notifyStaff(client: PoolClient, staffIds: readonly (number | null)[], n: NewNotification) {
  const ids = staffIds.filter((id): id is number => id !== null);
  if (!ids.length) return 0;
  const { rowCount } = await client.query(
    `INSERT INTO notifications (recipient_id, type, title, message, link, entity_name, entity_id)
     SELECT u.id, $2, $3, $4, $5, $6, $7 FROM users u WHERE u.is_active AND u.staff_id = ANY($1::int[])`,
    [ids, n.type, n.title, n.message, n.link ?? null, n.entityName ?? null, n.entityId ?? null],
  );
  return rowCount ?? 0;
}

/** Marks every recipient's open notifications of `type` about one record as read, e.g. once a reset is issued. */
export async function resolveNotifications(client: PoolClient, type: NotificationType, entityName: string, entityId: number) {
  await client.query(
    `UPDATE notifications SET is_read = TRUE, read_at = NOW()
     WHERE type = $1 AND entity_name = $2 AND entity_id = $3 AND NOT is_read`,
    [type, entityName, entityId],
  );
}

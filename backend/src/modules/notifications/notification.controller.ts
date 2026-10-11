import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../../config/db';
import { AppError } from '../../middleware/errorHandler';

/** Unread notifications are always listed; read ones only while recent. */
const READ_RETENTION_DAYS = 30;
const MAX_ITEMS = 100;

export const notificationIdParams = z.object({ id: z.coerce.number().int().positive('Invalid notification id') });

const SELECT = `
  SELECT id, title, message, type, link, is_read AS "isRead", created_at AS "createdAt"
  FROM notifications`;

export async function listNotifications(req: Request, res: Response) {
  const { rows } = await query(
    `${SELECT}
     WHERE recipient_id = $1 AND (NOT is_read OR created_at > NOW() - make_interval(days => $2))
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [req.user!.sub, READ_RETENTION_DAYS, MAX_ITEMS],
  );
  res.json({ success: true, data: rows });
}

export async function markNotificationRead(req: Request, res: Response) {
  const { rows } = await query(
    `UPDATE notifications SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND recipient_id = $2
     RETURNING id, title, message, type, link, is_read AS "isRead", created_at AS "createdAt"`,
    [Number(req.params.id), req.user!.sub],
  );
  if (!rows[0]) throw new AppError(404, 'Notification not found');
  res.json({ success: true, data: rows[0] });
}

export async function markAllNotificationsRead(req: Request, res: Response) {
  const { rowCount } = await query(
    'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE recipient_id = $1 AND NOT is_read',
    [req.user!.sub],
  );
  res.json({ success: true, message: 'All notifications marked as read', data: { updated: rowCount ?? 0 } });
}

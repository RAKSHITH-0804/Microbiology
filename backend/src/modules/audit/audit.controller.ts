import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../../config/db';

export const auditLogQuery = z.object({
  search: z.string().trim().max(100).optional(),
  action: z.string().trim().max(50).optional(),
  entity: z.string().trim().max(100).optional(),
  from: z.coerce.date({ invalid_type_error: 'Invalid from date' }).optional(),
  to: z.coerce.date({ invalid_type_error: 'Invalid to date' }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(25),
});
type AuditLogQuery = z.infer<typeof auditLogQuery>;

export async function listAuditLogs(req: Request, res: Response) {
  const q = req.query as unknown as AuditLogQuery;
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    conditions.push(sql(`$${params.length}`));
  };

  if (q.action) add((p) => `a.action = ${p}`, q.action);
  if (q.entity) add((p) => `a.entity_name = ${p}`, q.entity);
  if (q.from) add((p) => `a.created_at >= ${p}`, q.from);
  if (q.to) add((p) => `a.created_at <= ${p}`, q.to);
  if (q.search) {
    add(
      (p) => `(COALESCE(u.username, a.username) ILIKE ${p} OR s.name ILIKE ${p} OR a.entity_name ILIKE ${p}
               OR a.action ILIKE ${p} OR a.entity_id::text = TRIM(BOTH '%' FROM ${p}) OR a.details::text ILIKE ${p})`,
      `%${q.search}%`,
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const from = `FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN master_staff s ON s.id = u.staff_id`;

  const [items, total, facets] = await Promise.all([
    query(
      `SELECT a.id, a.user_id, COALESCE(u.username, a.username) AS username, s.name AS staff_name, u.role, a.action, a.entity_name, a.entity_id,
              a.details, a.created_at
       ${from} ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.page_size, (q.page - 1) * q.page_size],
    ),
    query<{ count: string }>(`SELECT COUNT(*) ${from} ${where}`, params),
    query<{ actions: string[] | null; entities: string[] | null }>(
      `SELECT ARRAY(SELECT DISTINCT action FROM audit_logs ORDER BY 1) AS actions,
              ARRAY(SELECT DISTINCT entity_name FROM audit_logs ORDER BY 1) AS entities`,
    ),
  ]);

  res.json({
    success: true,
    data: {
      items: items.rows,
      total: Number(total.rows[0].count),
      page: q.page,
      page_size: q.page_size,
      actions: facets.rows[0].actions ?? [],
      entities: facets.rows[0].entities ?? [],
    },
  });
}

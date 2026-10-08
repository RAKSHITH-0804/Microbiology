import { PoolClient } from 'pg';
import { pool } from '../config/db';

interface AuditEntry {
  userId: number | null;
  action: string;
  entityName: string;
  entityId?: number | null;
  details?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditEntry, client?: PoolClient): Promise<void> {
  const sql = `INSERT INTO audit_logs (user_id, action, entity_name, entity_id, details)
               VALUES ($1, $2, $3, $4, $5)`;
  const params = [entry.userId, entry.action, entry.entityName, entry.entityId ?? null, entry.details ?? null];
  try {
    await (client ? client.query(sql, params) : pool.query(sql, params));
  } catch (err) {
    if (client) throw err;
    console.error('Failed to write audit log:', err);
  }
}

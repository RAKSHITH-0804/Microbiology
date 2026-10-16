import path from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { testDbEnv } from './globalSetup';
import { pool } from './helpers';

const RESET_SCRIPT = path.resolve(__dirname, '../../database/reset.js');

const runReset = (env: NodeJS.ProcessEnv) =>
  spawnSync(process.execPath, [RESET_SCRIPT], { env, cwd: path.dirname(RESET_SCRIPT), encoding: 'utf8' });

describe('db:reset with the append-only audit trigger', () => {
  it('is refused in production and leaves the database untouched', async () => {
    await pool.query(`INSERT INTO audit_logs (action, entity_name, username) VALUES ('RESET_MARKER', 'tests', 'marker')`);

    const result = runReset({ ...testDbEnv(), NODE_ENV: 'production' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/prohibited in production/);

    const { rows } = await pool.query(`SELECT 1 FROM audit_logs WHERE action = 'RESET_MARKER'`);
    expect(rows).toHaveLength(1);
  });

  it('drops audit history in development and re-creates the protected schema', { timeout: 180_000 }, async () => {
    const result = runReset(testDbEnv());
    expect(result.status, result.stderr).toBe(0);

    const marker = await pool.query(`SELECT 1 FROM audit_logs WHERE action = 'RESET_MARKER'`);
    expect(marker.rows).toHaveLength(0);
    const triggers = await pool.query(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal ORDER BY tgname`,
    );
    expect(triggers.rows.map((r) => r.tgname)).toEqual(['trg_audit_logs_append_only', 'trg_audit_logs_no_truncate']);
  });
});

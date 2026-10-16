import { beforeAll, describe, expect, it } from 'vitest';
import { writeAuditLog } from '../src/utils/audit';
import { api, bearer, createUser, pool, TestUser } from './helpers';

async function auditRow(id: number) {
  const { rows } = await pool.query('SELECT * FROM audit_logs WHERE id = $1', [id]);
  return rows[0];
}

async function latestAuditId(userId: number) {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM audit_logs WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
    [userId],
  );
  return Number(rows[0].id);
}

describe('audit_logs is append-only', () => {
  let admin: TestUser;
  let entryId: number;

  beforeAll(async () => {
    admin = await createUser('SUPER_ADMIN');
    await writeAuditLog({ userId: admin.id, action: 'TEST_EVENT', entityName: 'tests', details: { n: 1 } });
    entryId = await latestAuditId(admin.id);
  });

  it('records the acting username on every new entry', async () => {
    expect((await auditRow(entryId)).username).toBe(admin.username);
  });

  it('keeps an explicit username when there is no account', async () => {
    await writeAuditLog({ userId: null, username: 'ghost', action: 'TEST_EVENT', entityName: 'tests' });
    const { rows } = await pool.query(`SELECT username FROM audit_logs WHERE user_id IS NULL AND username = 'ghost'`);
    expect(rows).toHaveLength(1);
  });

  it.each([
    ['details', `UPDATE audit_logs SET details = '{"n": 2}' WHERE id = $1`],
    ['action', `UPDATE audit_logs SET action = 'OTHER' WHERE id = $1`],
    ['username', `UPDATE audit_logs SET username = 'someone_else' WHERE id = $1`],
    ['created_at', `UPDATE audit_logs SET created_at = NOW() - INTERVAL '1 day' WHERE id = $1`],
    ['user_id plus another column', `UPDATE audit_logs SET user_id = NULL, action = 'OTHER' WHERE id = $1`],
  ])('rejects UPDATE of %s', async (_label, sql) => {
    await expect(pool.query(sql, [entryId])).rejects.toThrow(/append-only/);
    expect((await auditRow(entryId)).action).toBe('TEST_EVENT');
  });

  it('rejects re-pointing user_id at another account', async () => {
    const other = await createUser('CLERK');
    await expect(pool.query('UPDATE audit_logs SET user_id = $2 WHERE id = $1', [entryId, other.id])).rejects.toThrow(
      /append-only/,
    );
  });

  it('rejects DELETE', async () => {
    await expect(pool.query('DELETE FROM audit_logs WHERE id = $1', [entryId])).rejects.toThrow(/append-only/);
    expect(await auditRow(entryId)).toBeDefined();
  });

  it('rejects TRUNCATE', async () => {
    await expect(pool.query('TRUNCATE audit_logs')).rejects.toThrow(/append-only/);
    expect(await auditRow(entryId)).toBeDefined();
  });
});

describe('deleting a user with audit history', () => {
  it('succeeds and leaves the entries attributed by username', async () => {
    const admin = await createUser('SUPER_ADMIN');
    const clerk = await createUser('CLERK');
    await writeAuditLog({ userId: clerk.id, action: 'TEST_EVENT', entityName: 'tests' });
    const entryId = await latestAuditId(clerk.id);

    const res = await api().delete(`/api/users/${clerk.id}`).set(bearer(admin));
    expect(res.status).toBe(200);

    const { rows: users } = await pool.query('SELECT 1 FROM users WHERE id = $1', [clerk.id]);
    expect(users).toHaveLength(0);
    const entry = await auditRow(entryId);
    expect(entry.user_id).toBeNull();
    expect(entry.username).toBe(clerk.username);
    expect(entry.action).toBe('TEST_EVENT');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, bearer, createUser, lastSeenSecondsAgo, pool, setIdleMinutes } from './helpers';

describe('server-side idle timeout', () => {
  it('rejects a session idle for more than 17 minutes', async () => {
    const tech = await createUser('LAB_TECH');
    await setIdleMinutes(tech, 18);

    for (const [method, url] of [
      ['get', '/api/notifications'],
      ['get', '/api/auth/me'],
      ['post', '/api/auth/heartbeat'],
    ] as const) {
      const res = await api()[method](url).set(bearer(tech));
      expect(res.status, url).toBe(401);
      expect(res.body.errors?.code, url).toBe('SESSION_IDLE');
    }
  });

  it('accepts a session idle for 16 minutes and records the activity', async () => {
    const tech = await createUser('LAB_TECH');
    await setIdleMinutes(tech, 16);

    const res = await api().get('/api/notifications').set(bearer(tech));
    expect(res.status).toBe(200);
    expect(await lastSeenSecondsAgo(tech)).toBeLessThan(5);
  });

  it('does not count background polling as activity', async () => {
    const tech = await createUser('LAB_TECH');
    await setIdleMinutes(tech, 16);

    const res = await api().get('/api/notifications').set(bearer(tech)).set('X-Background-Request', '1');
    expect(res.status).toBe(200);
    expect(await lastSeenSecondsAgo(tech)).toBeGreaterThan(15 * 60);

    await setIdleMinutes(tech, 18);
    const late = await api().get('/api/notifications').set(bearer(tech)).set('X-Background-Request', '1');
    expect(late.status).toBe(401);
  });

  it('writes last_seen_at at most once a minute', async () => {
    const tech = await createUser('LAB_TECH');
    await pool.query(`UPDATE users SET last_seen_at = NOW() - INTERVAL '30 seconds' WHERE id = $1`, [tech.id]);

    await api().get('/api/notifications').set(bearer(tech)).expect(200);
    expect(await lastSeenSecondsAgo(tech)).toBeGreaterThanOrEqual(29);
  });

  it('keeps the session alive through the activity heartbeat', async () => {
    const tech = await createUser('LAB_TECH');
    await setIdleMinutes(tech, 10);

    await api().post('/api/auth/heartbeat').set(bearer(tech)).expect(204);
    expect(await lastSeenSecondsAgo(tech)).toBeLessThan(5);
  });

  it('starts a fresh activity window on login', async () => {
    const tech = await createUser('LAB_TECH', { password: 'Correct-Horse-1' });
    await setIdleMinutes(tech, 60);

    const res = await api().post('/api/auth/login').send({ username: tech.username, password: 'Correct-Horse-1' });
    expect(res.status).toBe(200);
    expect(await lastSeenSecondsAgo(tech)).toBeLessThan(5);
  });
});

describe('failed login audit', () => {
  const PASSWORD = 'S3cret-Attempt-Value!';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function failedLogins(username: string) {
    const { rows } = await pool.query(
      `SELECT user_id, username, entity_id, details FROM audit_logs WHERE action = 'LOGIN_FAILED' AND username = $1`,
      [username],
    );
    return rows;
  }

  it('records a wrong password with username, IP and reason, never the password', async () => {
    const tech = await createUser('LAB_TECH', { password: 'Correct-Horse-1' });
    const consoleSpies = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m));

    const res = await api().post('/api/auth/login').send({ username: tech.username, password: PASSWORD });
    expect(res.status).toBe(401);

    const [entry] = await failedLogins(tech.username);
    expect(entry.user_id).toBeNull();
    expect(entry.entity_id).toBe(tech.id);
    expect(entry.details.reason).toBe('bad_password');
    expect(entry.details.ip).toBeTruthy();
    expect(JSON.stringify(entry)).not.toContain(PASSWORD);
    for (const spy of consoleSpies) expect(JSON.stringify(spy.mock.calls)).not.toContain(PASSWORD);
  });

  it('records an unknown username', async () => {
    const res = await api().post('/api/auth/login').send({ username: 'nobody_here', password: PASSWORD });
    expect(res.status).toBe(401);
    const [entry] = await failedLogins('nobody_here');
    expect(entry.details.reason).toBe('unknown_user');
    expect(entry.entity_id).toBeNull();
  });

  it('truncates an oversized username to 50 characters', async () => {
    const long = `x${'y'.repeat(119)}`;
    const res = await api().post('/api/auth/login').send({ username: long, password: PASSWORD });
    expect(res.status).toBe(401);
    const entries = await failedLogins(long.slice(0, 50));
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries[0])).not.toContain(long.slice(0, 51));
  });

  it('records a disabled account', async () => {
    const clerk = await createUser('CLERK', { password: 'Correct-Horse-1', isActive: false });
    const res = await api().post('/api/auth/login').send({ username: clerk.username, password: 'Correct-Horse-1' });
    expect(res.status).toBe(403);
    const [entry] = await failedLogins(clerk.username);
    expect(entry.details.reason).toBe('disabled');
  });
});

describe('patient billing ledger', () => {
  it('audits every search and limits each user to 30 a minute', async () => {
    const tech = await createUser('LAB_TECH');
    for (let i = 0; i < 30; i++) {
      await api().get('/api/payments/patient-ledger').query({ patient_name: `Nobody ${i}` }).set(bearer(tech)).expect(200);
    }
    const blocked = await api().get('/api/payments/patient-ledger').query({ patient_name: 'One more' }).set(bearer(tech));
    expect(blocked.status).toBe(429);

    const { rows } = await pool.query(
      `SELECT details FROM audit_logs WHERE action = 'PATIENT_LEDGER_SEARCH' AND user_id = $1 ORDER BY id`,
      [tech.id],
    );
    expect(rows).toHaveLength(30);
    expect(rows[0].details).toMatchObject({ patient_name: 'Nobody 0', visits_found: 0 });

    const otherTech = await createUser('LAB_TECH');
    await api().get('/api/payments/patient-ledger').query({ patient_name: 'Someone' }).set(bearer(otherTech)).expect(200);
  });
});

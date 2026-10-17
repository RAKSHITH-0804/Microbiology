import { beforeAll, describe, expect, it } from 'vitest';
import { signToken } from '../src/utils/jwt';
import { api, bearer, createUser, pool, TestUser } from './helpers';

describe('session_version invalidates old tokens immediately', () => {
  let admin: TestUser;

  beforeAll(async () => {
    admin = await createUser('SUPER_ADMIN');
  });

  it('rejects an old token after an admin password reset (no sleep)', async () => {
    const user = await createUser('CLERK', { password: 'Old-Pass-1234' });
    const oldToken = user.token;

    const reset = await api()
      .post(`/api/users/${user.id}/reset-password`)
      .set(bearer(admin))
      .send({ password: 'Temp-Pass-1234' });
    expect(reset.status).toBe(200);

    const after = await api().get('/api/notifications').set({ Authorization: `Bearer ${oldToken}` });
    expect(after.status).toBe(401);

    const login = await api().post('/api/auth/login').send({ username: user.username, password: 'Temp-Pass-1234' });
    expect(login.status).toBe(200);
  });

  it('rejects an old token after a self-service password change; new cookie works', async () => {
    const password = 'Self-Pass-1234';
    const user = await createUser('LAB_TECH', { password });
    const oldToken = user.token;

    const change = await api()
      .post('/api/auth/change-password')
      .set(bearer(user))
      .send({ currentPassword: password, newPassword: 'Self-Pass-5678' });
    expect(change.status).toBe(200);

    const stale = await api().get('/api/auth/me').set({ Authorization: `Bearer ${oldToken}` });
    expect(stale.status).toBe(401);

    const cookie = change.headers['set-cookie'];
    expect(cookie).toBeTruthy();
    const fresh = await api().get('/api/auth/me').set('Cookie', cookie);
    expect(fresh.status).toBe(200);
  });

  it('rejects an old token after a forced first-login password change', async () => {
    const temp = 'Temp-First-1234';
    const user = await createUser('CLERK', { password: temp });
    await pool.query('UPDATE users SET must_change_password = TRUE WHERE id = $1', [user.id]);
    const oldToken = user.token;

    const change = await api()
      .post('/api/auth/change-password')
      .set(bearer(user))
      .send({ currentPassword: temp, newPassword: 'First-Login-5678' });
    expect(change.status).toBe(200);

    const stale = await api().get('/api/auth/me').set({ Authorization: `Bearer ${oldToken}` });
    expect(stale.status).toBe(401);

    const login = await api().post('/api/auth/login').send({ username: user.username, password: 'First-Login-5678' });
    expect(login.status).toBe(200);
  });

  it('rejects a forged token with a stale sv claim', async () => {
    const user = await createUser('CLERK', { password: 'Forge-Pass-1234' });
    const stale = signToken({ sub: user.id, username: user.username, role: user.role, sv: 0 });
    const res = await api().get('/api/auth/me').set({ Authorization: `Bearer ${stale}` });
    expect(res.status).toBe(401);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, createUser, grantModules, TestUser } from './helpers';

let seq = 0;
const newAccount = (role: string) => {
  seq += 1;
  return {
    username: `new_${role.toLowerCase()}_${process.pid}_${seq}`,
    role,
    staff_type: 'TEACHING',
    name: `New ${role} ${process.pid} ${seq}`,
    designation: 'Professor',
  };
};

describe('HOD and Super Admin accounts are reserved to the Super Admin', () => {
  let superAdmin: TestUser;
  let delegate: TestUser;
  let hod: TestUser;
  let clerk: TestUser;

  beforeAll(async () => {
    superAdmin = await createUser('SUPER_ADMIN');
    delegate = await createUser('LAB_TECH');
    await grantModules(delegate, 'users');
    hod = await createUser('HOD');
    clerk = await createUser('CLERK');
  });

  it('a user granted Users cannot create an HOD', async () => {
    const res = await api().post('/api/users').set(bearer(delegate)).send(newAccount('HOD'));
    expect(res.status).toBe(403);
  });

  it('a user granted Users cannot create a Super Admin', async () => {
    const res = await api().post('/api/users').set(bearer(delegate)).send(newAccount('SUPER_ADMIN'));
    expect(res.status).toBe(400);
  });

  it('a user granted Users can still create staff accounts', async () => {
    const res = await api().post('/api/users').set(bearer(delegate)).send(newAccount('CLERK'));
    expect(res.status).toBe(201);
  });

  it("a user granted Users cannot reset an HOD's password", async () => {
    const res = await api().post(`/api/users/${hod.id}/reset-password`).set(bearer(delegate)).send({ password: 'Temp-Pass-123' });
    expect(res.status).toBe(403);
  });

  it("a user granted Users can reset a staff member's password", async () => {
    const res = await api().post(`/api/users/${clerk.id}/reset-password`).set(bearer(delegate)).send({ password: 'Temp-Pass-123' });
    expect(res.status).toBe(200);
    // The reset signs the clerk out everywhere (session_version bump).
    const after = await api().get('/api/notifications').set(bearer(clerk));
    expect(after.status).toBe(401);
  });

  it('a user granted Users cannot deactivate or delete the Super Admin', async () => {
    const status = await api().patch(`/api/users/${superAdmin.id}/status`).set(bearer(delegate)).send({ is_active: false });
    expect(status.status).toBe(403);
    const del = await api().delete(`/api/users/${superAdmin.id}`).set(bearer(delegate));
    expect(del.status).toBe(403);
  });

  it('the Super Admin can create an HOD and reset its password', async () => {
    const created = await api().post('/api/users').set(bearer(superAdmin)).send(newAccount('HOD'));
    expect(created.status).toBe(201);
    const reset = await api().post(`/api/users/${hod.id}/reset-password`).set(bearer(superAdmin)).send({ password: 'Temp-Pass-123' });
    expect(reset.status).toBe(200);
  });

  it('staff without the Users module are refused outright', async () => {
    const plainClerk = await createUser('CLERK');
    const res = await api().post('/api/users').set(bearer(plainClerk)).send(newAccount('CLERK'));
    expect(res.status).toBe(403);
  });
});

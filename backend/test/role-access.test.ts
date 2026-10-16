import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, createRequisition, createUser, enterGeneralReport, TestUser } from './helpers';

describe('role access', () => {
  let tech: TestUser;
  let clerk: TestUser;
  let doctor: TestUser;
  let requisitionId: number;
  let reportId: number;

  beforeAll(async () => {
    tech = await createUser('LAB_TECH');
    clerk = await createUser('CLERK');
    doctor = await createUser('DOCTOR');
    requisitionId = (await createRequisition(tech)).id;
    reportId = await enterGeneralReport(tech, requisitionId, doctor);
  });

  const reason = 'Role access regression check';

  it('only doctors and the HOD verify reports', async () => {
    for (const user of [clerk, tech]) {
      const res = await api().post(`/api/reports/general/${reportId}/verify`).set(bearer(user));
      expect(res.status, user.role).toBe(403);
    }
  });

  it('clerks and doctors cannot change payments', async () => {
    for (const user of [clerk, doctor]) {
      const res = await api()
        .patch(`/api/requisitions/${requisitionId}/payment`)
        .set(bearer(user))
        .send({ total_amount_paise: 15050, paid_amount_paise: 0, reason });
      expect(res.status, user.role).toBe(403);
    }
  });

  it('clerks and doctors cannot open revenue reports', async () => {
    for (const user of [clerk, doctor]) {
      for (const path of ['/api/payments/summary', '/api/payments/history']) {
        expect((await api().get(path).set(bearer(user))).status, `${user.role} ${path}`).toBe(403);
      }
    }
  });

  it('only the Super Admin manages user accounts', async () => {
    for (const user of [clerk, doctor, tech]) {
      expect((await api().get('/api/users').set(bearer(user))).status, user.role).toBe(403);
    }
  });

  it('clerks cannot edit requisitions and doctors cannot register them', async () => {
    const edit = await api().put(`/api/requisitions/${requisitionId}`).set(bearer(clerk)).send({});
    expect(edit.status).toBe(403);
    const create = await api().post('/api/requisitions').set(bearer(doctor)).send({});
    expect(create.status).toBe(403);
  });

  it('only the HOD revokes; only the HOD or Super Admin cancels', async () => {
    for (const user of [clerk, doctor, tech]) {
      const revoke = await api().post(`/api/reports/general/${reportId}/revoke`).set(bearer(user)).send({ reason });
      expect(revoke.status, `revoke ${user.role}`).toBe(403);
      const cancel = await api().post(`/api/requisitions/${requisitionId}/cancel`).set(bearer(user)).send({ reason });
      expect(cancel.status, `cancel ${user.role}`).toBe(403);
    }
  });
});

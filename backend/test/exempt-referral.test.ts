import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  createRequisition,
  createUser,
  enterGeneralReport,
  grantModules,
  pool,
  requisitionBody,
  TestRequisition,
  TestUser,
} from './helpers';

const REFERRAL = 'Dr. Ramaswamy, Medical Superintendent CGH';

const exemptBill = { total_amount_paise: 15050, paid_amount_paise: 0, payment_mode: 'EXEMPT', exempt_referred_by: REFERRAL };

describe('exemption authority (Referred By)', () => {
  let tech: TestUser;
  let hod: TestUser;
  let doctor: TestUser;
  let clerk: TestUser;
  let exempt: TestRequisition;
  let paid: TestRequisition;

  beforeAll(async () => {
    tech = await createUser('LAB_TECH');
    hod = await createUser('HOD');
    doctor = await createUser('DOCTOR');
    clerk = await createUser('CLERK');
    exempt = await createRequisition(tech, exemptBill);
    paid = await createRequisition(tech);
    await enterGeneralReport(tech, exempt.id, doctor);
  });

  const history = (user: TestUser, search: string) =>
    api().get('/api/payments/history').query({ search, limit: 100 }).set(bearer(user));

  describe('ledger search', () => {
    it('finds Exempt bills by part of the referral name, ignoring case', async () => {
      const res = await history(tech, 'ramaswamy, medical');
      expect(res.status).toBe(200);
      const ids = res.body.data.items.map((r: { id: number }) => r.id);
      expect(ids).toContain(exempt.id);
      expect(ids).not.toContain(paid.id);
      const row = res.body.data.items.find((r: { id: number }) => r.id === exempt.id);
      expect(row).toMatchObject({ payment_status: 'EXEMPT', exempt_referred_by: REFERRAL });
    });

    it('treats LIKE wildcards in the search as plain text', async () => {
      const res = await history(tech, 'Rama%CGH');
      expect(res.body.data.items.map((r: { id: number }) => r.id)).not.toContain(exempt.id);
    });
  });

  describe('visibility', () => {
    const referralSeenBy = async (user: TestUser) => {
      const one = await api().get(`/api/requisitions/${exempt.id}`).set(bearer(user));
      expect(one.status, user.role).toBe(200);
      const timeline = await api().get(`/api/requisitions/${exempt.id}/timeline`).set(bearer(user));
      expect(timeline.status, user.role).toBe(200);
      return [one.body.data.exempt_referred_by, timeline.body.data.exempt_referred_by];
    };

    it('billing roles see it', async () => {
      expect(await referralSeenBy(tech)).toEqual([REFERRAL, REFERRAL]);
      expect(await referralSeenBy(hod)).toEqual([REFERRAL, REFERRAL]);
    });

    it('doctors and clerks do not', async () => {
      expect(await referralSeenBy(doctor)).toEqual([null, null]);
      const timeline = await api().get(`/api/requisitions/${exempt.id}/timeline`).set(bearer(clerk));
      expect(timeline.status).toBe(200);
      expect(timeline.body.data.exempt_referred_by).toBeNull();
    });

    it('is hidden from the directory, worklist and dashboard for doctors', async () => {
      const list = await api().get('/api/requisitions').query({ search: exempt.lab_no }).set(bearer(doctor));
      expect(list.body.data.items).toHaveLength(1);
      expect(list.body.data.items[0].exempt_referred_by).toBeNull();

      const pending = await api().get('/api/requisitions/pending').set(bearer(doctor));
      const row = pending.body.data.find((r: { id: number }) => r.id === exempt.id);
      expect(row.exempt_referred_by).toBeNull();

      const dashboard = await api().get('/api/dashboard/stats').set(bearer(doctor));
      for (const r of dashboard.body.data.recentRequisitions) expect(r.exempt_referred_by).toBeNull();
    });

    it('a billing grant lets a doctor see it', async () => {
      const granted = await createUser('DOCTOR');
      const own = await createRequisition(tech, exemptBill);
      await enterGeneralReport(tech, own.id, granted);
      await grantModules(granted, 'billing');
      const res = await api().get(`/api/requisitions/${own.id}`).set(bearer(granted));
      expect(res.body.data.exempt_referred_by).toBe(REFERRAL);
    });

    it('editing without billing access keeps the stored referral', async () => {
      const noBilling = await createUser('LAB_TECH');
      await pool.query(
        `INSERT INTO user_permissions (user_id, module_key, is_enabled) VALUES ($1, 'billing', FALSE)`,
        [noBilling.id],
      );
      const r = await createRequisition(tech, exemptBill);
      const seen = await api().get(`/api/requisitions/${r.id}`).set(bearer(noBilling));
      expect(seen.body.data.exempt_referred_by).toBeNull();

      const edit = await api()
        .put(`/api/requisitions/${r.id}`)
        .set(bearer(noBilling))
        .send({ ...r.body, exempt_referred_by: null, ward_unit: 'Ward 3' });
      expect(edit.status).toBe(200);
      const { rows } = await pool.query('SELECT exempt_referred_by FROM requisitions WHERE id = $1', [r.id]);
      expect(rows[0].exempt_referred_by).toBe(REFERRAL);
    });
  });

  describe('set-once freeze', () => {
    it('refuses Exempt without a referral name', async () => {
      const res = await api()
        .post('/api/requisitions')
        .set(bearer(tech))
        .send(requisitionBody({ ...exemptBill, exempt_referred_by: null }));
      expect(res.status).toBe(400);
      expect(res.body.errors?.exempt_referred_by?.[0]).toMatch(/referred|authorised|authorized/i);
    });

    it('Cash to Exempt with a referral works once; a later change is ignored', async () => {
      const r = await createRequisition(tech);
      const toExempt = await api()
        .patch(`/api/requisitions/${r.id}/payment`)
        .set(bearer(tech))
        .send({
          total_amount_paise: 0,
          paid_amount_paise: 0,
          payment_mode: 'EXEMPT',
          exempt_referred_by: REFERRAL,
          reason: 'Converted to fee exemption authorised by Medical Superintendent',
        });
      expect(toExempt.status).toBe(200);
      expect(toExempt.body.data.exempt_referred_by).toBe(REFERRAL);

      const attempt = await api()
        .patch(`/api/requisitions/${r.id}/payment`)
        .set(bearer(tech))
        .send({
          total_amount_paise: 0,
          paid_amount_paise: 0,
          payment_mode: 'EXEMPT',
          exempt_referred_by: 'Someone Else Entirely',
        });
      expect(attempt.status).toBe(200);
      const { rows } = await pool.query('SELECT exempt_referred_by, payment_mode FROM requisitions WHERE id = $1', [
        r.id,
      ]);
      expect(rows[0].exempt_referred_by).toBe(REFERRAL);

      const toCash = await api()
        .patch(`/api/requisitions/${r.id}/payment`)
        .set(bearer(tech))
        .send({
          total_amount_paise: 15050,
          paid_amount_paise: 15050,
          payment_mode: 'CASH',
          exempt_referred_by: 'Should Stay Frozen',
          reason: 'Returning to cash after temporary exemption for audit',
        });
      expect(toCash.status).toBe(200);
      const after = await pool.query('SELECT exempt_referred_by, payment_mode FROM requisitions WHERE id = $1', [r.id]);
      expect(after.rows[0].payment_mode).toBe('CASH');
      expect(after.rows[0].exempt_referred_by).toBe(REFERRAL);
    });

    it('PUT that tries to change a frozen referral is ignored', async () => {
      const r = await createRequisition(tech, exemptBill);
      const edit = await api()
        .put(`/api/requisitions/${r.id}`)
        .set(bearer(tech))
        .send({ ...r.body, exempt_referred_by: 'Changed On Put' });
      expect(edit.status).toBe(200);
      const { rows } = await pool.query('SELECT exempt_referred_by FROM requisitions WHERE id = $1', [r.id]);
      expect(rows[0].exempt_referred_by).toBe(REFERRAL);
    });
  });
});

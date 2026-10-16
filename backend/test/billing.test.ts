import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  auditRows,
  bearer,
  createRequisition,
  createUser,
  enterGeneralReport,
  pool,
  TestUser,
  verifyGeneralReport,
} from './helpers';

const REASON = 'Refund of duplicate charge to patient';

describe('billing', () => {
  let tech: TestUser;
  let doctor: TestUser;
  let hod: TestUser;

  beforeAll(async () => {
    tech = await createUser('LAB_TECH');
    doctor = await createUser('DOCTOR');
    hod = await createUser('HOD');
  });

  const patchPayment = (user: TestUser, id: number, body: Record<string, unknown>) =>
    api().patch(`/api/requisitions/${id}/payment`).set(bearer(user)).send(body);

  describe('lowering a fully paid bill', () => {
    it('needs a reason on the payment dialog, which is audited', async () => {
      const { id } = await createRequisition(tech);
      const lowered = { total_amount_paise: 15050, paid_amount_paise: 10000, payment_mode: 'CASH' };

      const missing = await patchPayment(tech, id, lowered);
      expect(missing.status).toBe(400);
      expect(missing.body.errors.reason).toBeDefined();

      const ok = await patchPayment(tech, id, { ...lowered, reason: REASON });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ paid_amount_paise: 10000, payment_status: 'PARTIAL' });

      const [audit] = await auditRows('PAYMENT_UPDATE', 'requisitions', id);
      expect(audit.details).toMatchObject({
        reason: REASON,
        changes: {
          paid_amount: { from: '150.50', to: '100.00' },
          payment_status: { from: 'PAID', to: 'PARTIAL' },
        },
      });
    });

    it('needs a reason on the requisition form', async () => {
      const r = await createRequisition(tech);
      const lowered = { ...r.body, total_amount_paise: 12000, paid_amount_paise: 12000 };

      const missing = await api().put(`/api/requisitions/${r.id}`).set(bearer(tech)).send(lowered);
      expect(missing.status).toBe(400);
      expect(missing.body.errors.billing_reason).toBeDefined();

      const ok = await api().put(`/api/requisitions/${r.id}`).set(bearer(tech)).send({ ...lowered, billing_reason: REASON });
      expect(ok.status).toBe(200);
      const [audit] = await auditRows('UPDATE', 'requisitions', r.id);
      expect(audit.details).toMatchObject({ billing_reason: REASON, changes: { total_amount: { from: '150.50', to: '120.00' } } });
    });

    it('does not need a reason to collect more or to change an unpaid bill', async () => {
      const { id } = await createRequisition(tech, { paid_amount_paise: 5000 });
      const settle = await patchPayment(tech, id, { total_amount_paise: 15050, paid_amount_paise: 15050, payment_mode: 'CASH' });
      expect(settle.status).toBe(200);
      expect(settle.body.data.payment_status).toBe('PAID');

      const partial = await createRequisition(tech, { paid_amount_paise: 5000 });
      const lower = await patchPayment(tech, partial.id, { total_amount_paise: 9000, paid_amount_paise: 5000, payment_mode: 'CASH' });
      expect(lower.status).toBe(200);
    });

    it('saves nothing, and needs no reason, when nothing changed', async () => {
      const { id } = await createRequisition(tech);
      const res = await patchPayment(tech, id, { total_amount_paise: 15050, paid_amount_paise: 15050, payment_mode: 'CASH' });
      expect(res.status).toBe(200);
      expect(res.body.data.changed).toBe(false);
      expect(await auditRows('PAYMENT_UPDATE', 'requisitions', id)).toEqual([]);
    });
  });

  describe('verified bills', () => {
    let id: number;

    beforeAll(async () => {
      ({ id } = await createRequisition(tech));
      await verifyGeneralReport(doctor, await enterGeneralReport(tech, id, doctor));
    });

    const raised = { total_amount_paise: 20000, paid_amount_paise: 20000, payment_mode: 'UPI' };

    it('only the HOD may change them', async () => {
      const res = await patchPayment(tech, id, { ...raised, reason: REASON });
      expect(res.status).toBe(403);
    });

    it('the HOD needs a reason, even to raise the bill', async () => {
      const missing = await patchPayment(hod, id, raised);
      expect(missing.status).toBe(400);
      expect(missing.body.errors.reason).toBeDefined();

      const ok = await patchPayment(hod, id, { ...raised, reason: 'Additional sensitivity panel billed' });
      expect(ok.status).toBe(200);
      const [audit] = await auditRows('VERIFIED_PAYMENT_OVERRIDE', 'requisitions', id);
      expect(audit.user_id).toBe(hod.id);
      expect(audit.details).toMatchObject({
        reason: 'Additional sensitivity panel billed',
        changes: { total_amount: { from: '150.50', to: '200.00' }, payment_mode: { from: 'CASH', to: 'UPI' } },
      });
    });
  });

  describe('integer paise', () => {
    it('round-trips amounts exactly', async () => {
      const r = await createRequisition(tech, { total_amount_paise: 10001, paid_amount_paise: 3333 });
      const res = await api().get(`/api/requisitions/${r.id}`).set(bearer(tech));
      expect(res.body.data).toMatchObject({ total_amount_paise: 10001, paid_amount_paise: 3333 });
      const { rows } = await pool.query('SELECT total_amount::text, paid_amount::text FROM requisitions WHERE id = $1', [r.id]);
      expect(rows[0]).toEqual({ total_amount: '100.01', paid_amount: '33.33' });

      const history = await api().get('/api/payments/history').query({ search: r.lab_no }).set(bearer(tech));
      expect(history.body.data.items[0]).toMatchObject({
        total_amount_paise: 10001,
        paid_amount_paise: 3333,
        balance_due_paise: 6668,
      });
    });

    it('rejects fractional paise and rupee-style decimals', async () => {
      const { id } = await createRequisition(tech);
      const res = await patchPayment(tech, id, { total_amount_paise: 150.5, paid_amount_paise: 150.5, payment_mode: 'CASH' });
      expect(res.status).toBe(400);
      expect(res.body.errors.total_amount_paise).toBeDefined();
    });

    it('sums totals as exact integers', async () => {
      await createRequisition(tech, { total_amount_paise: 1, paid_amount_paise: 1 });
      await createRequisition(tech, { total_amount_paise: 2, paid_amount_paise: 2 });
      const res = await api().get('/api/payments/summary').set(bearer(tech));
      expect(res.status).toBe(200);
      const { rows } = await pool.query<{ billed: string; paid: string }>(
        'SELECT (SUM(total_amount) * 100)::text AS billed, (SUM(paid_amount) * 100)::text AS paid FROM requisitions',
      );
      expect(Number.isInteger(res.body.data.filtered_billed_paise)).toBe(true);
      expect(String(res.body.data.filtered_billed_paise)).toBe(rows[0].billed.replace(/\.0+$/, ''));
      expect(String(res.body.data.filtered_collection_paise)).toBe(rows[0].paid.replace(/\.0+$/, ''));
    });
  });
});

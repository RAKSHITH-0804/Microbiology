import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  auditRows,
  bearer,
  createRequisition,
  createUser,
  enterGeneralReport,
  generalReportBody,
  pool,
  TestRequisition,
  TestUser,
  verifyGeneralReport,
} from './helpers';

const REASON = 'Wrong organism recorded on the report';

describe('report lifecycle', () => {
  let tech: TestUser;
  let doctor: TestUser;
  let hod: TestUser;
  let superAdmin: TestUser;

  beforeAll(async () => {
    tech = await createUser('LAB_TECH');
    doctor = await createUser('DOCTOR');
    hod = await createUser('HOD');
    superAdmin = await createUser('SUPER_ADMIN');
  });

  /** A requisition with a general report entered by the technician and assigned to `doctor`. */
  async function reported() {
    const requisition = await createRequisition(tech);
    const reportId = await enterGeneralReport(tech, requisition.id, doctor);
    return { requisition, reportId };
  }

  async function verified() {
    const r = await reported();
    await verifyGeneralReport(doctor, r.reportId);
    return r;
  }

  async function reportState(reportId: number) {
    const { rows } = await pool.query<{ is_verified: boolean; verified_by: number | null; status: string }>(
      `SELECT g.is_verified, g.verified_by, r.status
       FROM general_reports g JOIN requisitions r ON r.id = g.requisition_id WHERE g.id = $1`,
      [reportId],
    );
    return rows[0];
  }

  async function alertsFor(user: TestUser, reportId: number) {
    const { rows } = await pool.query<{ type: string; link: string }>(
      `SELECT type, link FROM notifications
       WHERE recipient_id = $1 AND entity_name = 'general_reports' AND entity_id = $2`,
      [user.id, reportId],
    );
    return rows;
  }

  describe('revoking verification', () => {
    it('is HOD only and needs a written reason', async () => {
      const { reportId } = await verified();
      const short = await api().post(`/api/reports/general/${reportId}/revoke`).set(bearer(hod)).send({ reason: 'typo' });
      expect(short.status).toBe(400);
      expect(short.body.errors.reason).toBeDefined();
      expect((await reportState(reportId)).is_verified).toBe(true);
    });

    it('returns the report to the doctor, audits the reason and notifies them', async () => {
      const { requisition, reportId } = await verified();
      const res = await api().post(`/api/reports/general/${reportId}/revoke`).set(bearer(hod)).send({ reason: REASON });
      expect(res.status).toBe(200);

      expect(await reportState(reportId)).toEqual({ is_verified: false, verified_by: null, status: 'REPORT_ENTERED' });
      const [audit] = await auditRows('REPORT_VERIFICATION_REVOKED', 'general_reports', reportId);
      expect(audit.user_id).toBe(hod.id);
      expect(audit.details).toMatchObject({ reason: REASON, lab_no: requisition.lab_no, report_type: 'general' });
      expect(audit.details.previously_verified_by).toBeTruthy();
      expect(await alertsFor(doctor, reportId)).toEqual([
        { type: 'ALERT', link: `/reports/general/${requisition.id}` },
      ]);

      // Back in the doctor's queue, and verifiable again.
      const queue = await api().get('/api/reports/unverified').set(bearer(doctor));
      expect(queue.body.data.map((r: { report_id: number }) => r.report_id)).toContain(reportId);
      await verifyGeneralReport(doctor, reportId);
    });

    it('refuses a report that is not verified', async () => {
      const { reportId } = await reported();
      const res = await api().post(`/api/reports/general/${reportId}/revoke`).set(bearer(hod)).send({ reason: REASON });
      expect(res.status).toBe(409);
    });

    it('refuses on a cancelled requisition', async () => {
      const { requisition, reportId } = await verified();
      expect((await api().post(`/api/requisitions/${requisition.id}/cancel`).set(bearer(hod)).send({ reason: REASON })).status).toBe(200);
      const res = await api().post(`/api/reports/general/${reportId}/revoke`).set(bearer(hod)).send({ reason: REASON });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cancelled/);
      expect((await reportState(reportId)).is_verified).toBe(true);
    });
  });

  describe('cancelling a requisition', () => {
    let cancelled: TestRequisition;
    let cancelledReportId: number;

    beforeAll(async () => {
      const r = await reported();
      cancelled = r.requisition;
      cancelledReportId = r.reportId;
      const res = await api().post(`/api/requisitions/${cancelled.id}/cancel`).set(bearer(superAdmin)).send({ reason: REASON });
      expect(res.status).toBe(200);
    });

    it('records who cancelled it and why', async () => {
      const [audit] = await auditRows('REQUISITION_CANCEL', 'requisitions', cancelled.id);
      expect(audit.user_id).toBe(superAdmin.id);
      expect(audit.details).toMatchObject({ reason: REASON, had_verified_report: false });
      const res = await api().get(`/api/requisitions/${cancelled.id}`).set(bearer(tech));
      expect(res.body.data.cancelled_at).toBeTruthy();
      expect(res.body.data.cancel_reason).toBe(REASON);
    });

    it('cannot be cancelled twice', async () => {
      const res = await api().post(`/api/requisitions/${cancelled.id}/cancel`).set(bearer(hod)).send({ reason: REASON });
      expect(res.status).toBe(409);
    });

    it('blocks report saves, verification, payments and edits', async () => {
      const save = await api()
        .post('/api/reports/general')
        .set(bearer(tech))
        .send(generalReportBody(cancelled.id, tech.staffId!, doctor.staffId!, 'Changed after cancel'));
      expect(save.status).toBe(400);
      expect((await api().post(`/api/reports/general/${cancelledReportId}/verify`).set(bearer(doctor))).status).toBe(400);
      const pay = await api()
        .patch(`/api/requisitions/${cancelled.id}/payment`)
        .set(bearer(tech))
        .send({ total_amount_paise: 20000, paid_amount_paise: 20000, payment_mode: 'CASH' });
      expect(pay.status).toBe(400);
      const edit = await api().put(`/api/requisitions/${cancelled.id}`).set(bearer(hod)).send(cancelled.body);
      expect(edit.status).toBe(400);
    });

    it('leaves the worklist and the verification queue', async () => {
      const pending = await api().get('/api/requisitions/pending').set(bearer(tech));
      expect(pending.body.data.map((r: { id: number }) => r.id)).not.toContain(cancelled.id);
      const queue = await api().get('/api/reports/unverified').set(bearer(hod));
      expect(queue.body.data.map((r: { report_id: number }) => r.report_id)).not.toContain(cancelledReportId);
    });

    it('needs the HOD once a report is verified', async () => {
      const { requisition } = await verified();
      const bySa = await api().post(`/api/requisitions/${requisition.id}/cancel`).set(bearer(superAdmin)).send({ reason: REASON });
      expect(bySa.status).toBe(403);
      const byHod = await api().post(`/api/requisitions/${requisition.id}/cancel`).set(bearer(hod)).send({ reason: REASON });
      expect(byHod.status).toBe(200);
      const [audit] = await auditRows('REQUISITION_CANCEL', 'requisitions', requisition.id);
      expect(audit.details.had_verified_report).toBe(true);
    });

    it('needs a reason', async () => {
      const { requisition } = await reported();
      const res = await api().post(`/api/requisitions/${requisition.id}/cancel`).set(bearer(hod)).send({ reason: 'dup' });
      expect(res.status).toBe(400);
    });
  });

  describe('editing a verified report', () => {
    it('stays locked for everyone except the HOD', async () => {
      const { requisition } = await verified();
      const body = generalReportBody(requisition.id, tech.staffId!, doctor.staffId!, 'Late correction');
      expect((await api().post('/api/reports/general').set(bearer(tech)).send(body)).status).toBe(400);
      expect((await api().post('/api/reports/general').set(bearer(doctor)).send(body)).status).toBe(400);
      const edit = await api().put(`/api/requisitions/${requisition.id}`).set(bearer(tech)).send(requisition.body);
      expect(edit.status).toBe(400);
    });

    it('an unchanged save by the HOD keeps the verification', async () => {
      const { requisition, reportId } = await verified();
      const res = await api()
        .post('/api/reports/general')
        .set(bearer(hod))
        .send(generalReportBody(requisition.id, tech.staffId!, doctor.staffId!));
      expect(res.status).toBe(409);
      expect((await reportState(reportId)).is_verified).toBe(true);
    });

    it('an HOD report correction resets verification, audits old and new values and notifies the doctor', async () => {
      const { requisition, reportId } = await verified();
      const res = await api()
        .post('/api/reports/general')
        .set(bearer(hod))
        .send(generalReportBody(requisition.id, tech.staffId!, doctor.staffId!, 'Escherichia coli isolated'));
      expect(res.status).toBe(200);
      expect(res.body.data.verification_reset).toBe(true);

      expect(await reportState(reportId)).toEqual({ is_verified: false, verified_by: null, status: 'REPORT_ENTERED' });
      const [reset] = await auditRows('VERIFICATION_RESET', 'general_reports', reportId);
      expect(reset.user_id).toBe(hod.id);
      expect(reset.details).toMatchObject({
        trigger: 'report_edit',
        changes: { report_findings: { from: 'No growth', to: 'Escherichia coli isolated' } },
      });
      const updates = await auditRows('UPDATE', 'general_reports', reportId);
      expect(updates.at(-1)!.details.changes).toEqual({ report_findings: { from: 'No growth', to: 'Escherichia coli isolated' } });
      expect(await alertsFor(doctor, reportId)).toHaveLength(1);
    });

    it('an HOD edit of printed patient details resets verification', async () => {
      const { requisition, reportId } = await verified();
      const body = { ...requisition.body, patient: { ...requisition.body.patient, name: 'Corrected Patient Name' } };
      const res = await api().put(`/api/requisitions/${requisition.id}`).set(bearer(hod)).send(body);
      expect(res.status).toBe(200);
      expect(res.body.data.verification_reset).toBe(true);

      expect((await reportState(reportId)).is_verified).toBe(false);
      const [reset] = await auditRows('VERIFICATION_RESET', 'general_reports', reportId);
      expect(reset.details).toMatchObject({
        trigger: 'requisition_edit',
        changes: { patient_name: { from: 'Test Patient', to: 'Corrected Patient Name' } },
      });
      expect(await alertsFor(doctor, reportId)).toHaveLength(1);
    });

    it('an HOD edit of unprinted details keeps the verification', async () => {
      const { requisition, reportId } = await verified();
      const res = await api()
        .put(`/api/requisitions/${requisition.id}`)
        .set(bearer(hod))
        .send({ ...requisition.body, ward_unit: 'Ward 7' });
      expect(res.status).toBe(200);
      expect(res.body.data.verification_reset).toBe(false);
      expect((await reportState(reportId)).is_verified).toBe(true);
    });

    it('billing edits never reset verification', async () => {
      const { requisition, reportId } = await verified();
      const pay = await api()
        .patch(`/api/requisitions/${requisition.id}/payment`)
        .set(bearer(hod))
        .send({ total_amount_paise: 12000, paid_amount_paise: 12000, payment_mode: 'CASH', reason: 'Senior citizen concession applied' });
      expect(pay.status).toBe(200);

      const edit = await api()
        .put(`/api/requisitions/${requisition.id}`)
        .set(bearer(hod))
        .send({
          ...requisition.body,
          total_amount_paise: 10000,
          paid_amount_paise: 10000,
          billing_reason: 'Further concession approved by HOD',
        });
      expect(edit.status).toBe(200);
      expect(edit.body.data.verification_reset).toBe(false);

      expect(await reportState(reportId)).toMatchObject({ is_verified: true, status: 'VERIFIED' });
      expect(await auditRows('VERIFICATION_RESET', 'general_reports', reportId)).toEqual([]);
      expect(await alertsFor(doctor, reportId)).toEqual([]);
    });
  });

  describe('print logging', () => {
    it('records draft prints and final prints from the saved report', async () => {
      const { requisition, reportId } = await reported();
      const draft = await api().post(`/api/reports/general/${requisition.id}/print-log`).set(bearer(doctor));
      expect(draft.status).toBe(201);
      expect(draft.body.data.draft).toBe(true);

      await verifyGeneralReport(doctor, reportId);
      const final = await api().post(`/api/reports/general/${requisition.id}/print-log`).set(bearer(tech));
      expect(final.body.data.draft).toBe(false);

      const prints = await auditRows('REPORT_PRINT', 'general_reports', reportId);
      expect(prints.map((p) => [p.user_id, p.details.draft])).toEqual([
        [doctor.id, true],
        [tech.id, false],
      ]);
    });

    it('needs a saved report', async () => {
      const requisition = await createRequisition(tech);
      const res = await api().post(`/api/reports/antibiogram/${requisition.id}/print-log`).set(bearer(tech));
      expect(res.status).toBe(404);
    });
  });
});

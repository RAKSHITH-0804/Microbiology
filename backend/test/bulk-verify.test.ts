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
  TestUser,
} from './helpers';

async function tick(doctor: TestUser, type: 'general' | 'antibiogram', id: number, checked = true) {
  return api().put(`/api/reports/${type}/${id}/review-mark`).set(bearer(doctor)).send({ checked });
}

async function bulk(doctor: TestUser, reports: { type: 'general' | 'antibiogram'; id: number }[]) {
  return api().post('/api/reports/bulk-verify').set(bearer(doctor)).send({ reports });
}

describe('doctor bulk verification', () => {
  let tech: TestUser;
  let doctorA: TestUser;
  let doctorB: TestUser;
  let hod: TestUser;

  beforeAll(async () => {
    tech = await createUser('LAB_TECH');
    doctorA = await createUser('DOCTOR');
    doctorB = await createUser('DOCTOR');
    hod = await createUser('HOD');
  });

  async function reportedFor(doctor: TestUser, findings = 'No growth') {
    const requisition = await createRequisition(tech);
    const reportId = await enterGeneralReport(tech, requisition.id, doctor, findings);
    return { requisition, reportId };
  }

  it('doctor ticks and bulk-verifies only their own reports', async () => {
    const a = await reportedFor(doctorA, 'A findings');
    const b = await reportedFor(doctorB, 'B findings');

    expect((await tick(doctorA, 'general', a.reportId)).status).toBe(200);
    expect((await tick(doctorA, 'general', b.reportId)).status).toBe(403);

    const queue = await api().get('/api/reports/unverified').set(bearer(doctorA));
    const mine = queue.body.data.find((r: { report_id: number }) => r.report_id === a.reportId);
    expect(mine.reviewed).toBe(true);

    const res = await bulk(doctorA, [
      { type: 'general', id: a.reportId },
      { type: 'general', id: b.reportId },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.data.verified).toBe(1);
    expect(res.body.data.skipped).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: b.reportId, reason: 'not_assigned' })]),
    );

    const [audit] = await auditRows('VERIFY', 'general_reports', a.reportId);
    expect(audit.details).toMatchObject({ bulk: true });
  });

  it('HOD and LAB_TECH get 403 on mark, bulk, clear-all and select-all', async () => {
    const { reportId } = await reportedFor(doctorA);
    expect((await tick(hod, 'general', reportId)).status).toBe(403);
    expect((await tick(tech, 'general', reportId)).status).toBe(403);
    expect((await bulk(hod, [{ type: 'general', id: reportId }])).status).toBe(403);
    expect((await bulk(tech, [{ type: 'general', id: reportId }])).status).toBe(403);
    expect((await api().delete('/api/reports/review-marks').set(bearer(hod))).status).toBe(403);
    expect((await api().delete('/api/reports/review-marks').set(bearer(tech))).status).toBe(403);
    expect((await api().post('/api/reports/review-marks/select-all').set(bearer(hod))).status).toBe(403);
    expect((await api().post('/api/reports/review-marks/select-all').set(bearer(tech))).status).toBe(403);
  });

  it('clear-all and select-all are not swallowed by /:type/:id routes', async () => {
    const clear = await api().delete('/api/reports/review-marks').set(bearer(doctorA));
    expect(clear.status).toBe(200);
    expect(clear.body.data).toEqual(expect.objectContaining({ cleared: expect.any(Number) }));
    expect(clear.body.message ?? '').not.toMatch(/general or antibiogram/i);

    const select = await api().post('/api/reports/review-marks/select-all').set(bearer(doctorA));
    expect(select.status).toBe(200);
    expect(select.body.data).toEqual(expect.objectContaining({ marked: expect.any(Number) }));
    expect(select.body.message ?? '').not.toMatch(/general or antibiogram/i);
  });

  it('clear all removes only the logged-in doctor marks', async () => {
    const a = await reportedFor(doctorA, 'clear A');
    const b = await reportedFor(doctorB, 'clear B');
    expect((await tick(doctorA, 'general', a.reportId)).status).toBe(200);
    expect((await tick(doctorB, 'general', b.reportId)).status).toBe(200);

    const clear = await api().delete('/api/reports/review-marks').set(bearer(doctorA));
    expect(clear.status).toBe(200);
    expect(clear.body.data.cleared).toBeGreaterThanOrEqual(1);

    const marksA = await pool.query(
      `SELECT 1 FROM report_review_marks WHERE user_id = $1 AND report_type = 'general' AND report_id = $2`,
      [doctorA.id, a.reportId],
    );
    const marksB = await pool.query(
      `SELECT 1 FROM report_review_marks WHERE user_id = $1 AND report_type = 'general' AND report_id = $2`,
      [doctorB.id, b.reportId],
    );
    expect(marksA.rowCount).toBe(0);
    expect(marksB.rowCount).toBe(1);
  });

  it('select all only marks that doctor assigned unverified reports and does not verify', async () => {
    const mine = await reportedFor(doctorA, 'select mine');
    const theirs = await reportedFor(doctorB, 'select theirs');

    const select = await api().post('/api/reports/review-marks/select-all').set(bearer(doctorA));
    expect(select.status).toBe(200);
    expect(select.body.data.marked).toBeGreaterThanOrEqual(1);

    const queue = await api().get('/api/reports/unverified').set(bearer(doctorA));
    const mineRow = queue.body.data.find((r: { report_id: number }) => r.report_id === mine.reportId);
    expect(mineRow?.reviewed).toBe(true);

    const theirMark = await pool.query(
      `SELECT 1 FROM report_review_marks WHERE user_id = $1 AND report_type = 'general' AND report_id = $2`,
      [doctorA.id, theirs.reportId],
    );
    expect(theirMark.rowCount).toBe(0);

    const { rows } = await pool.query<{ is_verified: boolean }>(
      'SELECT is_verified FROM general_reports WHERE id = $1',
      [mine.reportId],
    );
    expect(rows[0].is_verified).toBe(false);
  });

  it('a stale tick is not returned as reviewed on the unverified list', async () => {
    const { requisition, reportId } = await reportedFor(doctorA, 'Stale original');
    expect((await tick(doctorA, 'general', reportId)).status).toBe(200);

    const edit = await api()
      .post('/api/reports/general')
      .set(bearer(tech))
      .send(generalReportBody(requisition.id, tech.staffId!, doctorA.staffId!, 'Stale edited'));
    expect(edit.status).toBe(200);

    const markStillThere = await pool.query(
      `SELECT 1 FROM report_review_marks WHERE user_id = $1 AND report_type = 'general' AND report_id = $2`,
      [doctorA.id, reportId],
    );
    expect(markStillThere.rowCount).toBe(1);

    const queue = await api().get('/api/reports/unverified').set(bearer(doctorA));
    const row = queue.body.data.find((r: { report_id: number }) => r.report_id === reportId);
    expect(row?.reviewed).toBe(false);
    expect(row?.review_stale).toBe(true);
  });

  it('an edit after the tick is skipped as changed', async () => {
    const { requisition, reportId } = await reportedFor(doctorA, 'Original');
    expect((await tick(doctorA, 'general', reportId)).status).toBe(200);

    const edit = await api()
      .post('/api/reports/general')
      .set(bearer(tech))
      .send(generalReportBody(requisition.id, tech.staffId!, doctorA.staffId!, 'Edited findings'));
    expect(edit.status).toBe(200);

    const res = await bulk(doctorA, [{ type: 'general', id: reportId }]);
    expect(res.status).toBe(200);
    expect(res.body.data.verified).toBe(0);
    expect(res.body.data.skipped[0]).toMatchObject({ reason: 'changed' });
  });

  it('a requisition patient-field edit after the tick is skipped', async () => {
    const { requisition, reportId } = await reportedFor(doctorA);
    expect((await tick(doctorA, 'general', reportId)).status).toBe(200);

    const edit = await api()
      .put(`/api/requisitions/${requisition.id}`)
      .set(bearer(tech))
      .send({
        ...requisition.body,
        patient: { ...requisition.body.patient, name: 'Changed Patient Name' },
      });
    expect(edit.status).toBe(200);

    const res = await bulk(doctorA, [{ type: 'general', id: reportId }]);
    expect(res.body.data.skipped[0]).toMatchObject({ reason: 'changed' });
  });

  it('changing one antibiogram result after the tick skips that report', async () => {
    const requisition = await createRequisition(tech);
    const body = {
      requisition_id: requisition.id,
      prepared_by: tech.staffId,
      reported_by: doctorA.staffId,
      culture_status: 'GROWTH',
      grams_stain_remark: 'GNB',
      organisms: [
        {
          organism_name: 'E. coli',
          results: [
            { antibiotic_name: 'Amikacin', sensitivity_result: 'S' },
            { antibiotic_name: 'Ciprofloxacin', sensitivity_result: 'R' },
          ],
        },
      ],
    };
    const created = await api().post('/api/reports/antibiogram').set(bearer(tech)).send(body);
    expect(created.status).toBe(200);
    const reportId = created.body.data.id as number;

    expect((await tick(doctorA, 'antibiogram', reportId)).status).toBe(200);

    const changed = await api()
      .post('/api/reports/antibiogram')
      .set(bearer(tech))
      .send({
        ...body,
        organisms: [
          {
            organism_name: 'E. coli',
            results: [
              { antibiotic_name: 'Amikacin', sensitivity_result: 'R' },
              { antibiotic_name: 'Ciprofloxacin', sensitivity_result: 'R' },
            ],
          },
        ],
      });
    expect(changed.status).toBe(200);

    const res = await bulk(doctorA, [{ type: 'antibiogram', id: reportId }]);
    expect(res.body.data.verified).toBe(0);
    expect(res.body.data.skipped[0]).toMatchObject({ reason: 'changed' });
  });

  it('cancelled and already verified reports are skipped', async () => {
    const pending = await reportedFor(doctorA, 'pending');
    const verified = await reportedFor(doctorA, 'to verify');
    expect((await tick(doctorA, 'general', pending.reportId)).status).toBe(200);
    expect((await tick(doctorA, 'general', verified.reportId)).status).toBe(200);
    expect(
      (await api().post(`/api/reports/general/${verified.reportId}/verify`).set(bearer(doctorA))).status,
    ).toBe(200);

    await api()
      .post(`/api/requisitions/${pending.requisition.id}/cancel`)
      .set(bearer(hod))
      .send({ reason: 'Sample unsuitable for culture testing' });

    // Re-tick cancelled is refused; bulk with old ids skips.
    const res = await bulk(doctorA, [
      { type: 'general', id: pending.reportId },
      { type: 'general', id: verified.reportId },
    ]);
    expect(res.body.data.verified).toBe(0);
    const reasons = res.body.data.skipped.map((s: { reason: string }) => s.reason).sort();
    expect(reasons).toEqual(expect.arrayContaining(['cancelled', 'already_verified']));
  });

  it('ticks persist after a new login', async () => {
    const password = 'Bulk-Tick-1234';
    const doctor = await createUser('DOCTOR', { password });
    const { reportId } = await reportedFor(doctor);
    expect((await tick(doctor, 'general', reportId)).status).toBe(200);

    const login = await api().post('/api/auth/login').send({ username: doctor.username, password });
    expect(login.status).toBe(200);
    const cookie = login.headers['set-cookie'];
    const queue = await api().get('/api/reports/unverified').set('Cookie', cookie);
    const row = queue.body.data.find((r: { report_id: number }) => r.report_id === reportId);
    expect(row?.reviewed).toBe(true);
  });

  it('a concurrent edit and bulk verify never verifies the stale content', async () => {
    const { requisition, reportId } = await reportedFor(doctorA, 'Race original');
    expect((await tick(doctorA, 'general', reportId)).status).toBe(200);

    const editPromise = api()
      .post('/api/reports/general')
      .set(bearer(tech))
      .send(generalReportBody(requisition.id, tech.staffId!, doctorA.staffId!, 'Race edited'));
    const bulkPromise = bulk(doctorA, [{ type: 'general', id: reportId }]);
    const [editRes, bulkRes] = await Promise.all([editPromise, bulkPromise]);
    expect(bulkRes.status).toBe(200);

    const { rows } = await pool.query<{ is_verified: boolean; report_findings: string }>(
      'SELECT is_verified, report_findings FROM general_reports WHERE id = $1',
      [reportId],
    );
    // Bulk either verified the ticked content (edit then hits lock), or skipped after the edit landed first.
    if (rows[0].is_verified) {
      expect(rows[0].report_findings).toBe('Race original');
      expect(editRes.status).toBe(400);
    } else {
      expect(rows[0].report_findings).toBe('Race edited');
      expect(bulkRes.body.data.verified).toBe(0);
      expect(bulkRes.body.data.skipped[0].reason).toBe('changed');
    }
  });
});

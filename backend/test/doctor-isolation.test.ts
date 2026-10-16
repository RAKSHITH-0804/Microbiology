import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  createRequisition,
  createUser,
  enterGeneralReport,
  generalReportBody,
  grantModules,
  TestRequisition,
  TestUser,
} from './helpers';

/**
 * A doctor sees a requisition only when one of its reports names them as reporting doctor.
 * Module grants open screens, never other doctors' patients.
 */
describe('doctor isolation', () => {
  let tech: TestUser;
  let doctorA: TestUser;
  let doctorB: TestUser;
  let grantedA: TestUser;
  let mine: TestRequisition;
  let theirs: TestRequisition;
  let namedConsultant: TestRequisition;

  const ids = (items: { id: number }[]) => items.map((r) => r.id);

  beforeAll(async () => {
    tech = await createUser('LAB_TECH');
    doctorA = await createUser('DOCTOR', { name: `Dr Alpha ${process.pid}` });
    doctorB = await createUser('DOCTOR');
    mine = await createRequisition(tech);
    theirs = await createRequisition(tech);
    // The consultant field carries doctor A's name, but the report is assigned to doctor B.
    namedConsultant = await createRequisition(tech, { consultant_doctor: `Dr. Alpha ${process.pid}` });
    await enterGeneralReport(tech, mine.id, doctorA);
    await enterGeneralReport(tech, theirs.id, doctorB);
    await enterGeneralReport(tech, namedConsultant.id, doctorB);

    // A doctor with work of their own plus every module grant the Super Admin could give.
    grantedA = await createUser('DOCTOR');
    await enterGeneralReport(tech, (await createRequisition(tech)).id, grantedA);
    await grantModules(grantedA, 'requisitions', 'pending_worklist', 'reports', 'verification', 'status_timeline', 'billing');
  });

  it('opens an assigned requisition but not another doctor’s', async () => {
    expect((await api().get(`/api/requisitions/${mine.id}`).set(bearer(doctorA))).status).toBe(200);
    expect((await api().get(`/api/requisitions/${theirs.id}`).set(bearer(doctorA))).status).toBe(403);
  });

  it('naming the doctor as consultant gives no access', async () => {
    expect((await api().get(`/api/requisitions/${namedConsultant.id}`).set(bearer(doctorA))).status).toBe(403);
    const list = await api().get('/api/requisitions').query({ search: namedConsultant.lab_no }).set(bearer(doctorA));
    expect(ids(list.body.data.items)).not.toContain(namedConsultant.id);
  });

  it('filters the directory, the worklist and the status search', async () => {
    const list = await api().get('/api/requisitions').query({ pageSize: 100 }).set(bearer(doctorA));
    expect(ids(list.body.data.items)).toContain(mine.id);
    expect(ids(list.body.data.items)).not.toContain(theirs.id);

    const pending = await api().get('/api/requisitions/pending').set(bearer(doctorA));
    expect(ids(pending.body.data)).toContain(mine.id);
    expect(ids(pending.body.data)).not.toContain(theirs.id);

    const search = await api().get('/api/requisitions/status-search').query({ q: theirs.lab_no }).set(bearer(doctorA));
    expect(search.status).toBe(200);
    expect(ids(search.body.data)).toEqual([]);
  });

  it('refuses another doctor’s timeline', async () => {
    expect((await api().get(`/api/requisitions/${mine.id}/timeline`).set(bearer(doctorA))).status).toBe(200);
    expect((await api().get(`/api/requisitions/${theirs.id}/timeline`).set(bearer(doctorA))).status).toBe(403);
  });

  it('limits the dashboard to the doctor’s own work', async () => {
    const res = await api().get('/api/dashboard/stats').set(bearer(doctorA));
    expect(res.status).toBe(200);
    const recent = ids(res.body.data.recentRequisitions);
    expect(recent).not.toContain(theirs.id);
    expect(recent).not.toContain(namedConsultant.id);
  });

  it('limits the report archive and the verification queue', async () => {
    const archive = await api().get('/api/reports').query({ pageSize: 100 }).set(bearer(doctorA));
    const archived = archive.body.data.items.map((r: { requisition_id: number }) => r.requisition_id);
    expect(archived).toContain(mine.id);
    expect(archived).not.toContain(theirs.id);

    const queue = await api().get('/api/reports/unverified').set(bearer(doctorA));
    const queued = queue.body.data.map((r: { requisition_id: number }) => r.requisition_id);
    expect(queued).toContain(mine.id);
    expect(queued).not.toContain(theirs.id);
  });

  it('cannot save, take over or print another doctor’s report', async () => {
    const asSelf = generalReportBody(theirs.id, doctorA.staffId!, doctorA.staffId!);
    expect((await api().post('/api/reports/general').set(bearer(doctorA)).send(asSelf)).status).toBe(403);
    const asOwner = generalReportBody(theirs.id, doctorA.staffId!, doctorB.staffId!);
    expect((await api().post('/api/reports/general').set(bearer(doctorA)).send(asOwner)).status).toBe(403);
    expect((await api().post(`/api/reports/general/${theirs.id}/print-log`).set(bearer(doctorA))).status).toBe(403);
  });

  it('module grants never widen what a doctor can see', async () => {
    expect((await api().get(`/api/requisitions/${theirs.id}`).set(bearer(grantedA))).status).toBe(403);
    const list = await api().get('/api/requisitions').query({ pageSize: 100 }).set(bearer(grantedA));
    expect(ids(list.body.data.items)).not.toContain(theirs.id);
    const pending = await api().get('/api/requisitions/pending').set(bearer(grantedA));
    expect(ids(pending.body.data)).not.toContain(theirs.id);
    const archive = await api().get('/api/reports').query({ pageSize: 100 }).set(bearer(grantedA));
    expect(archive.body.data.items.map((r: { requisition_id: number }) => r.requisition_id)).not.toContain(theirs.id);
    const queue = await api().get('/api/reports/unverified').set(bearer(grantedA));
    expect(queue.body.data.map((r: { requisition_id: number }) => r.requisition_id)).not.toContain(theirs.id);
  });

  it('a granted doctor still cannot edit or bill another doctor’s requisition', async () => {
    const edit = await api().put(`/api/requisitions/${theirs.id}`).set(bearer(grantedA)).send(theirs.body);
    expect(edit.status).toBe(403);
    const pay = await api()
      .patch(`/api/requisitions/${theirs.id}/payment`)
      .set(bearer(grantedA))
      .send({ total_amount_paise: 15050, paid_amount_paise: 0, reason: 'Testing isolation rules' });
    expect(pay.status).toBe(403);
  });

  it('a doctor without a linked staff record sees nothing', async () => {
    const unlinked = await createUser('DOCTOR', { withStaff: false });
    const list = await api().get('/api/requisitions').set(bearer(unlinked));
    expect(list.body.data.items).toEqual([]);
    expect((await api().get(`/api/requisitions/${mine.id}`).set(bearer(unlinked))).status).toBe(403);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  CATALOG_TEST,
  createRequisition,
  createUser,
  pool,
  requisitionBody,
  TestUser,
} from './helpers';

describe('Receipt No uniqueness and immutability', () => {
  let tech: TestUser;
  let hod: TestUser;
  let doctor: TestUser;
  let clerk: TestUser;
  let superAdmin: TestUser;

  beforeAll(async () => {
    tech = await createUser('LAB_TECH');
    hod = await createUser('HOD');
    doctor = await createUser('DOCTOR');
    clerk = await createUser('CLERK');
    superAdmin = await createUser('SUPER_ADMIN');
    await pool.query(
      'INSERT INTO master_test_catalog (category, test_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [CATALOG_TEST.test_category, CATALOG_TEST.test_name],
    );
  });

  it('rejects a duplicate Receipt No on create', async () => {
    const first = await createRequisition(tech, { receipt_no: 'RCP-DUP-1' });
    const res = await api()
      .post('/api/requisitions')
      .set(bearer(tech))
      .send({ ...first.body, lab_no: `T-other-${first.id}`, receipt_no: 'RCP-DUP-1' });
    expect(res.status).toBe(409);
    expect(res.body.errors?.receipt_no).toContain('Receipt No already exists');
  });

  it('rejects case and surrounding-space variants of an existing Receipt No on create', async () => {
    await createRequisition(tech, { receipt_no: 'Rcp Case 22' });
    for (const receipt_no of ['rcp case 22', '  RCP CASE 22  ']) {
      const res = await api()
        .post('/api/requisitions')
        .set(bearer(tech))
        .send(requisitionBody({ receipt_no }));
      expect(res.status, receipt_no).toBe(409);
      expect(res.body.errors?.receipt_no).toContain('Receipt No already exists');
    }
  });

  it('ignores Receipt No changes from every role on edit', async () => {
    const r = await createRequisition(tech, { receipt_no: 'RCP-LOCKED-1' });
    const actors: TestUser[] = [tech, hod, doctor, clerk, superAdmin];
    for (const actor of actors) {
      await api()
        .put(`/api/requisitions/${r.id}`)
        .set(bearer(actor))
        .send({ ...r.body, receipt_no: `HACKED-${actor.role}`, ward_unit: `Ward ${actor.role}` });
      const { rows } = await pool.query<{ receipt_no: string }>('SELECT receipt_no FROM requisitions WHERE id = $1', [
        r.id,
      ]);
      expect(rows[0].receipt_no, actor.role).toBe('RCP-LOCKED-1');
    }
  });

  it('keeps the stored Receipt No when the same value is sent on edit', async () => {
    const r = await createRequisition(tech, { receipt_no: 'RCP-SAME-1' });
    const res = await api()
      .put(`/api/requisitions/${r.id}`)
      .set(bearer(tech))
      .send({ ...r.body, receipt_no: 'RCP-SAME-1', ward_unit: 'Ward Same' });
    expect(res.status).toBe(200);
    expect(res.body.data.receipt_no).toBe('RCP-SAME-1');
  });
});

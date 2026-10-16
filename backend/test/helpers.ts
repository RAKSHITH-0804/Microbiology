import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/db';
import type { ModuleKey } from '../src/modules/permissions/permission.modules';
import { signToken, UserRole } from '../src/utils/jwt';

export { pool };

export const app = createApp();
export const api = () => request(app);

export interface TestUser {
  id: number;
  username: string;
  role: UserRole;
  staffId: number | null;
  token: string;
}

let seq = 0;

interface CreateUserOptions {
  name?: string;
  withStaff?: boolean;
  /** Real password for login tests; other accounts get an unusable hash. */
  password?: string;
  isActive?: boolean;
}

/** Inserts an account (with its own staff record unless Super Admin) and signs a token for it. */
export async function createUser(role: UserRole, opts: CreateUserOptions = {}): Promise<TestUser> {
  seq += 1;
  const username = `t_${role.toLowerCase()}_${process.pid}_${seq}`;
  let staffId: number | null = null;
  if (opts.withStaff ?? role !== 'SUPER_ADMIN') {
    const staff = await pool.query<{ id: number }>(
      `INSERT INTO master_staff (name, designation, staff_type) VALUES ($1, 'Test', $2) RETURNING id`,
      [opts.name ?? `Staff ${username}`, role === 'DOCTOR' || role === 'HOD' ? 'TEACHING' : 'NON_TEACHING'],
    );
    staffId = staff.rows[0].id;
  }
  const hash = opts.password ? await bcrypt.hash(opts.password, 4) : 'not-a-real-hash';
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (username, password_hash, role, staff_id, must_change_password, is_active)
     VALUES ($1, $2, $3, $4, FALSE, $5) RETURNING id`,
    [username, hash, role, staffId, opts.isActive ?? true],
  );
  const id = rows[0].id;
  return { id, username, role, staffId, token: signToken({ sub: id, username, role }) };
}

export const bearer = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

/** Super Admin override: switches `modules` on for the user beyond their role defaults. */
export async function grantModules(user: TestUser, ...modules: ModuleKey[]) {
  for (const m of modules) {
    await pool.query(
      `INSERT INTO user_permissions (user_id, module_key, is_enabled) VALUES ($1, $2, TRUE)
       ON CONFLICT (user_id, module_key) DO UPDATE SET is_enabled = TRUE`,
      [user.id, m],
    );
  }
}

/** Pretends the user's last activity was `minutes` ago. */
export async function setIdleMinutes(user: TestUser, minutes: number) {
  await pool.query(`UPDATE users SET last_seen_at = NOW() - make_interval(mins => $2) WHERE id = $1`, [user.id, minutes]);
}

export const CATALOG_TEST = { test_category: 'Bacteriology - Culture', test_name: 'Test Culture' };

const labRun = Math.random().toString(36).slice(2, 8);
let labSeq = 0;

/** A valid New Requisition body (fully paid, Rs 150.50) with a unique Lab No. */
export function requisitionBody(overrides: Record<string, unknown> = {}) {
  labSeq += 1;
  return {
    lab_no: `T-${labRun}-${labSeq}`,
    hospital: 'CGH',
    sample_nature: 'Urine',
    patient: { name: 'Test Patient', age_years: 30, sex: 'M', phone: '9876543210' },
    requisition_tests: [CATALOG_TEST],
    total_amount_paise: 15050,
    paid_amount_paise: 15050,
    payment_mode: 'CASH',
    ...overrides,
  };
}

export interface TestRequisition {
  id: number;
  lab_no: string;
  body: ReturnType<typeof requisitionBody>;
}

/** Registers a requisition through the API, as `actor`. */
export async function createRequisition(actor: TestUser, overrides: Record<string, unknown> = {}): Promise<TestRequisition> {
  await pool.query(
    'INSERT INTO master_test_catalog (category, test_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [CATALOG_TEST.test_category, CATALOG_TEST.test_name],
  );
  const body = requisitionBody(overrides);
  const res = await api().post('/api/requisitions').set(bearer(actor)).send(body);
  if (res.status !== 201) throw new Error(`createRequisition failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.data.id, lab_no: res.body.data.lab_no, body };
}

export const generalReportBody = (requisitionId: number, preparedBy: number, reportedBy: number, findings = 'No growth') => ({
  requisition_id: requisitionId,
  specimen: 'Urine',
  investigation_done: 'Culture',
  report_findings: findings,
  prepared_by: preparedBy,
  reported_by: reportedBy,
});

/** Saves a general report naming `doctor` as reporting doctor, as `author`; returns the report id. */
export async function enterGeneralReport(author: TestUser, requisitionId: number, doctor: TestUser, findings?: string) {
  const res = await api()
    .post('/api/reports/general')
    .set(bearer(author))
    .send(generalReportBody(requisitionId, author.staffId!, doctor.staffId!, findings));
  if (res.status !== 200) throw new Error(`enterGeneralReport failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.id as number;
}

export async function verifyGeneralReport(verifier: TestUser, reportId: number) {
  const res = await api().post(`/api/reports/general/${reportId}/verify`).set(bearer(verifier));
  if (res.status !== 200) throw new Error(`verifyGeneralReport failed: ${res.status} ${JSON.stringify(res.body)}`);
}

/** Audit rows for one entity, oldest first. */
export async function auditRows(action: string, entityName: string, entityId: number) {
  const { rows } = await pool.query<{ user_id: number | null; details: Record<string, unknown> }>(
    `SELECT user_id, details FROM audit_logs WHERE action = $1 AND entity_name = $2 AND entity_id = $3 ORDER BY id`,
    [action, entityName, entityId],
  );
  return rows;
}

export async function lastSeenSecondsAgo(user: TestUser): Promise<number> {
  const { rows } = await pool.query<{ s: number }>(
    'SELECT EXTRACT(EPOCH FROM NOW() - last_seen_at)::float8 AS s FROM users WHERE id = $1',
    [user.id],
  );
  return rows[0].s;
}

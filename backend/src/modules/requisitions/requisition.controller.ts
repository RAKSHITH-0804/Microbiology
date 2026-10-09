import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { writeAuditLog } from '../../utils/audit';
import { AuthUser } from '../../utils/jwt';
import { assertRequisitionUnlocked } from '../../utils/reportLock';
import { billingFor, derivePaymentStatus, RELEASED_PAYMENT_STATUSES, UpdatePaymentInput } from './payment';
import { CreateRequisitionInput, ListRequisitionsQuery } from './requisition.schema';

type PatientInput = CreateRequisitionInput['patient'];

/** Reuses an existing patient matched on name + phone (updating demographics), otherwise inserts a new one. */
async function upsertPatient(client: PoolClient, p: PatientInput): Promise<{ id: number; created: boolean }> {
  if (p.phone) {
    const existing = await client.query<{ id: number }>(
      `SELECT id FROM patients
       WHERE LOWER(name) = LOWER($1) AND phone = $2
       ORDER BY id DESC LIMIT 1
       FOR UPDATE`,
      [p.name, p.phone],
    );
    if (existing.rows[0]) {
      const id = existing.rows[0].id;
      await client.query(
        `UPDATE patients
         SET name = $2, age_value = $3, age_unit = $4, age_years = $5, age_months = $6, age_days = $7, sex = $8
         WHERE id = $1`,
        [id, p.name, p.age_value, p.age_unit, p.age_years, p.age_months, p.age_days, p.sex],
      );
      return { id, created: false };
    }
  }

  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO patients (name, age_value, age_unit, age_years, age_months, age_days, sex, phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [p.name, p.age_value, p.age_unit, p.age_years, p.age_months, p.age_days, p.sex, p.phone],
  );
  return { id: rows[0].id, created: true };
}

async function assertTestsInCatalog(client: PoolClient, tests: CreateRequisitionInput['requisition_tests']) {
  const { rows } = await client.query<{ key: string }>(
    `SELECT category || '|' || test_name AS key
     FROM master_test_catalog
     WHERE is_active AND (category, test_name) IN (
       SELECT * FROM UNNEST($1::text[], $2::text[])
     )`,
    [tests.map((t) => t.test_category), tests.map((t) => t.test_name)],
  );
  const known = new Set(rows.map((r) => r.key));
  const unknown = tests.filter((t) => !known.has(`${t.test_category}|${t.test_name}`));
  if (unknown.length > 0) {
    throw new AppError(400, 'Unknown investigation(s) selected', {
      requisition_tests: unknown.map((t) => `${t.test_category}: ${t.test_name}`),
    });
  }
}

export async function createRequisition(req: Request, res: Response) {
  const input = req.body as CreateRequisitionInput;
  const userId = req.user!.sub;
  const hospital = input.hospital === 'Other' ? input.hospital_other : input.hospital;
  const billing = billingFor(input);

  try {
    const result = await withTransaction(async (client) => {
      const dup = await client.query('SELECT 1 FROM requisitions WHERE LOWER(lab_no) = LOWER($1)', [input.lab_no]);
      if (dup.rowCount) throw new AppError(409, `Lab No "${input.lab_no}" is already registered`, { lab_no: ['Lab No already exists'] });

      await assertTestsInCatalog(client, input.requisition_tests);
      const patient = await upsertPatient(client, input.patient);

      const { rows } = await client.query<{
        id: number;
        lab_no: string;
        status: string;
        payment_status: string;
        sample_received_datetime: Date;
      }>(
        `INSERT INTO requisitions (
           lab_no, receipt_no, patient_id, hospital, consultant_doctor, op_ip_no, ward_unit,
           clinical_diagnosis, preferred_antibiotics, antibiotics_used, sample_nature, site_of_collection,
           sample_collection_datetime, sample_received_datetime, status, created_by,
           address, total_amount, paid_amount, payment_status, payment_mode
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'RECEIVED',$15,$16,$17,$18,$19,$20)
         RETURNING id, lab_no, status, payment_status, sample_received_datetime`,
        [
          input.lab_no,
          input.receipt_no,
          patient.id,
          hospital,
          input.consultant_doctor,
          input.op_ip_no,
          input.ward_unit,
          input.clinical_diagnosis,
          input.preferred_antibiotics,
          input.antibiotics_used,
          input.sample_nature,
          input.site_of_collection,
          input.sample_collection_datetime,
          input.sample_received_datetime,
          userId,
          input.address,
          billing.total_amount,
          billing.paid_amount,
          billing.payment_status,
          billing.payment_mode,
        ],
      );
      const requisition = rows[0];

      await client.query(
        `INSERT INTO requisition_tests (requisition_id, test_category, test_name)
         SELECT $1, * FROM UNNEST($2::text[], $3::text[])`,
        [
          requisition.id,
          input.requisition_tests.map((t) => t.test_category),
          input.requisition_tests.map((t) => t.test_name),
        ],
      );

      await writeAuditLog(
        {
          userId,
          action: 'CREATE',
          entityName: 'requisitions',
          entityId: requisition.id,
          details: {
            lab_no: requisition.lab_no,
            patient_id: patient.id,
            patient_created: patient.created,
            tests: input.requisition_tests.length,
            total_amount: billing.total_amount,
            paid_amount: billing.paid_amount,
            payment_status: billing.payment_status,
            payment_mode: billing.payment_mode,
          },
        },
        client,
      );

      return { ...requisition, patient_id: patient.id, patient_created: patient.created };
    });

    res.status(201).json({ success: true, message: `Requisition ${result.lab_no} saved`, data: result });
  } catch (err) {
    if ((err as { code?: string; constraint?: string }).constraint === 'requisitions_lab_no_key') {
      throw new AppError(409, `Lab No "${input.lab_no}" is already registered`, { lab_no: ['Lab No already exists'] });
    }
    throw err;
  }
}

const EDITABLE_COLUMNS = [
  'lab_no',
  'receipt_no',
  'hospital',
  'consultant_doctor',
  'op_ip_no',
  'ward_unit',
  'clinical_diagnosis',
  'preferred_antibiotics',
  'antibiotics_used',
  'sample_nature',
  'site_of_collection',
  'sample_collection_datetime',
  'sample_received_datetime',
  'address',
  'total_amount',
  'paid_amount',
  'payment_status',
  'payment_mode',
] as const;
type EditableColumn = (typeof EDITABLE_COLUMNS)[number];

/** NUMERIC comes back from pg as a string; read amounts as numbers so audit diffs compare like with like. */
const AMOUNT_COLUMNS: readonly string[] = ['total_amount', 'paid_amount'];
const selectColumn = (c: string) => (AMOUNT_COLUMNS.includes(c) ? `${c}::float8 AS ${c}` : c);

const comparable = (v: unknown) => (v instanceof Date ? v.toISOString() : (v ?? null));

/**
 * Applies demographic edits to the requisition's patient. A patient row shared with other
 * requisitions is only edited in place when name and phone are unchanged; otherwise this
 * requisition is moved to the matching (or a new) patient so other history stays intact.
 */
async function applyPatientEdit(client: PoolClient, requisitionId: number, currentPatientId: number, p: PatientInput) {
  const { rows } = await client.query<{ name: string; phone: string | null; shared: boolean }>(
    `SELECT name, phone,
            EXISTS (SELECT 1 FROM requisitions WHERE patient_id = $1 AND id <> $2) AS shared
     FROM patients WHERE id = $1 FOR UPDATE`,
    [currentPatientId, requisitionId],
  );
  const current = rows[0];
  const sameIdentity = current.name.toLowerCase() === p.name.toLowerCase() && (current.phone ?? null) === p.phone;

  if (!current.shared || sameIdentity) {
    await client.query(
      `UPDATE patients
       SET name = $2, age_value = $3, age_unit = $4, age_years = $5, age_months = $6, age_days = $7, sex = $8, phone = $9
       WHERE id = $1`,
      [currentPatientId, p.name, p.age_value, p.age_unit, p.age_years, p.age_months, p.age_days, p.sex, p.phone],
    );
    return { id: currentPatientId, reassigned: false };
  }

  const patient = await upsertPatient(client, p);
  return { id: patient.id, reassigned: true };
}

export async function updateRequisition(req: Request, res: Response) {
  const id = Number(req.params.id);
  const input = req.body as CreateRequisitionInput;
  const userId = req.user!.sub;
  const hospital = input.hospital === 'Other' ? input.hospital_other : input.hospital;
  const billing = billingFor(input);

  try {
    const result = await withTransaction(async (client) => {
      const existing = await client.query<Record<EditableColumn, unknown> & { patient_id: number; status: string }>(
        `SELECT patient_id, status, ${EDITABLE_COLUMNS.map(selectColumn).join(', ')} FROM requisitions WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const before = existing.rows[0];
      if (!before) throw new AppError(404, 'Requisition not found');
      await assertRequisitionUnlocked(client, id, before.status);

      const dup = await client.query('SELECT 1 FROM requisitions WHERE LOWER(lab_no) = LOWER($1) AND id <> $2', [input.lab_no, id]);
      if (dup.rowCount) throw new AppError(409, `Lab No "${input.lab_no}" is already registered`, { lab_no: ['Lab No already exists'] });

      await assertTestsInCatalog(client, input.requisition_tests);
      const patient = await applyPatientEdit(client, id, before.patient_id, input.patient);

      const after: Record<EditableColumn, unknown> = {
        lab_no: input.lab_no,
        receipt_no: input.receipt_no,
        hospital,
        consultant_doctor: input.consultant_doctor,
        op_ip_no: input.op_ip_no,
        ward_unit: input.ward_unit,
        clinical_diagnosis: input.clinical_diagnosis,
        preferred_antibiotics: input.preferred_antibiotics,
        antibiotics_used: input.antibiotics_used,
        sample_nature: input.sample_nature,
        site_of_collection: input.site_of_collection,
        sample_collection_datetime: input.sample_collection_datetime,
        sample_received_datetime: input.sample_received_datetime,
        address: input.address,
        ...billing,
      };

      const { rows } = await client.query<{ id: number; lab_no: string; status: string; payment_status: string }>(
        `UPDATE requisitions
         SET ${EDITABLE_COLUMNS.map((c, i) => `${c} = $${i + 3}`).join(', ')}, patient_id = $2
         WHERE id = $1
         RETURNING id, lab_no, status, payment_status`,
        [id, patient.id, ...EDITABLE_COLUMNS.map((c) => after[c])],
      );

      const previousTests = await client.query<{ test_category: string; test_name: string }>(
        'DELETE FROM requisition_tests WHERE requisition_id = $1 RETURNING test_category, test_name',
        [id],
      );
      await client.query(
        `INSERT INTO requisition_tests (requisition_id, test_category, test_name)
         SELECT $1, * FROM UNNEST($2::text[], $3::text[])`,
        [id, input.requisition_tests.map((t) => t.test_category), input.requisition_tests.map((t) => t.test_name)],
      );

      const changes = Object.fromEntries(
        EDITABLE_COLUMNS.filter((c) => comparable(before[c]) !== comparable(after[c])).map((c) => [
          c,
          { from: comparable(before[c]), to: comparable(after[c]) },
        ]),
      );
      const testKeys = (tests: { test_category: string; test_name: string }[]) =>
        tests.map((t) => `${t.test_category}: ${t.test_name}`).sort();
      const oldTests = testKeys(previousTests.rows);
      const newTests = testKeys(input.requisition_tests);

      await writeAuditLog(
        {
          userId,
          action: 'UPDATE',
          entityName: 'requisitions',
          entityId: id,
          details: {
            lab_no: rows[0].lab_no,
            changes,
            patient_id: patient.id,
            patient_reassigned: patient.reassigned,
            tests_added: newTests.filter((t) => !oldTests.includes(t)),
            tests_removed: oldTests.filter((t) => !newTests.includes(t)),
          },
        },
        client,
      );

      return { ...rows[0], patient_id: patient.id };
    });

    res.json({ success: true, message: `Requisition ${result.lab_no} updated`, data: result });
  } catch (err) {
    if ((err as { constraint?: string }).constraint === 'requisitions_lab_no_key') {
      throw new AppError(409, `Lab No "${input.lab_no}" is already registered`, { lab_no: ['Lab No already exists'] });
    }
    throw err;
  }
}

export const REQUISITION_SELECT = `
  SELECT r.id, r.lab_no, r.receipt_no, r.status, r.hospital, r.consultant_doctor,
         r.op_ip_no, r.ward_unit, r.clinical_diagnosis, r.preferred_antibiotics, r.antibiotics_used,
         r.sample_nature, r.site_of_collection,
         r.sample_collection_datetime, r.sample_received_datetime, r.created_at,
         r.address, r.total_amount::float8 AS total_amount, r.paid_amount::float8 AS paid_amount,
         r.payment_status, r.payment_mode,
         json_build_object(
           'id', p.id, 'name', p.name, 'age_value', p.age_value,
           'age_unit', p.age_unit, 'age_years', p.age_years, 'age_months', p.age_months,
           'age_days', p.age_days, 'sex', p.sex, 'phone', p.phone
         ) AS patient,
         COALESCE(
           (SELECT json_agg(
                     json_build_object(
                       'test_category', t.test_category,
                       'test_name', t.test_name,
                       'template_test_name', c.template_test_name
                     ) ORDER BY t.id)
            FROM requisition_tests t
            LEFT JOIN master_test_catalog c ON c.category = t.test_category AND c.test_name = t.test_name
            WHERE t.requisition_id = r.id),
           '[]'
         ) AS tests,
         (SELECT g.id FROM general_reports g WHERE g.requisition_id = r.id) AS general_report_id,
         (SELECT a.id FROM antibiogram_reports a WHERE a.requisition_id = r.id) AS antibiogram_report_id,
         (SELECT g.is_verified FROM general_reports g WHERE g.requisition_id = r.id) AS general_report_verified,
         (SELECT a.is_verified FROM antibiogram_reports a WHERE a.requisition_id = r.id) AS antibiogram_report_verified
  FROM requisitions r
  JOIN patients p ON p.id = r.patient_id`;

/** Requisitions with a report whose reporting doctor is the staff id bound to `param` (never matches NULL). */
export const assignedToDoctor = (param: string) =>
  `(EXISTS (SELECT 1 FROM general_reports g WHERE g.requisition_id = r.id AND g.reported_by = ${param})
    OR EXISTS (SELECT 1 FROM antibiogram_reports a WHERE a.requisition_id = r.id AND a.reported_by = ${param}))`;

export async function listPendingRequisitions(req: Request, res: Response) {
  const params: unknown[] = [RELEASED_PAYMENT_STATUSES];
  let doctorFilter = '';
  if (req.user!.role === 'DOCTOR') {
    params.push(req.user!.staff_id);
    doctorFilter = `AND ${assignedToDoctor(`$${params.length}`)}`;
  }

  const { rows } = await query(
    `${REQUISITION_SELECT}
     WHERE r.status IN ('RECEIVED', 'REPORT_ENTERED')
       AND r.payment_status = ANY($1::text[])
       ${doctorFilter}
     ORDER BY r.sample_received_datetime DESC, r.id DESC`,
    params,
  );
  res.json({ success: true, data: rows });
}

/**
 * Settles or corrects billing. Deliberately not blocked by the report lock: a bill can be
 * paid after the reports are verified without reopening any clinical data.
 */
export async function updatePayment(req: Request, res: Response) {
  const id = Number(req.params.id);
  const input = req.body as UpdatePaymentInput;
  const paymentStatus = derivePaymentStatus(input.total_amount, input.paid_amount, input.payment_mode);

  const result = await withTransaction(async (client) => {
    const existing = await client.query<{
      lab_no: string;
      total_amount: number;
      paid_amount: number;
      payment_status: string;
      payment_mode: string | null;
    }>(
      `SELECT lab_no, total_amount::float8 AS total_amount, paid_amount::float8 AS paid_amount, payment_status, payment_mode
       FROM requisitions WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const before = existing.rows[0];
    if (!before) throw new AppError(404, 'Requisition not found');

    const after = {
      total_amount: input.total_amount,
      paid_amount: input.paid_amount,
      payment_status: paymentStatus,
      payment_mode: input.payment_mode,
    };
    const changes = Object.fromEntries(
      (Object.keys(after) as (keyof typeof after)[])
        .filter((k) => (before[k] ?? null) !== (after[k] ?? null))
        .map((k) => [k, { from: before[k] ?? null, to: after[k] ?? null }]),
    );
    if (Object.keys(changes).length === 0) {
      return { id, lab_no: before.lab_no, ...after, changed: false };
    }

    await client.query(
      `UPDATE requisitions
       SET total_amount = $2, paid_amount = $3, payment_status = $4, payment_mode = $5
       WHERE id = $1`,
      [id, after.total_amount, after.paid_amount, after.payment_status, after.payment_mode],
    );
    await writeAuditLog(
      {
        userId: req.user!.sub,
        action: 'PAYMENT_UPDATE',
        entityName: 'requisitions',
        entityId: id,
        details: { lab_no: before.lab_no, changes },
      },
      client,
    );
    return { id, lab_no: before.lab_no, ...after, changed: true };
  });

  res.json({
    success: true,
    message: result.changed ? `Payment updated for ${result.lab_no}` : 'No payment changes to save',
    data: result,
  });
}

export async function listRequisitions(req: Request, res: Response) {
  const q = req.query as unknown as ListRequisitionsQuery;
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    conditions.push(sql(`$${params.length}`));
  };

  if (req.user!.role === 'DOCTOR') add(assignedToDoctor, req.user!.staff_id);
  if (q.search) {
    add(
      (p) => `(r.lab_no ILIKE ${p} OR p.name ILIKE ${p} OR r.receipt_no ILIKE ${p} OR p.phone ILIKE ${p})`,
      `%${q.search.replace(/[\\%_]/g, '\\$&')}%`,
    );
  }
  if (q.fromDate) add((p) => `r.sample_received_datetime >= ${p}::date`, q.fromDate);
  if (q.toDate) add((p) => `r.sample_received_datetime < ${p}::date + 1`, q.toDate);
  if (q.paymentStatus) add((p) => `r.payment_status = ${p}`, q.paymentStatus);

  // Status counts ignore the status filter so the dropdown can show how many match each option.
  const baseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const baseParams = [...params];
  if (q.status) add((p) => `r.status = ${p}`, q.status);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [items, counts] = await Promise.all([
    query(
      `${REQUISITION_SELECT} ${where}
       ORDER BY r.sample_received_datetime DESC, r.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize],
    ),
    query<{ status: string; count: string }>(
      `SELECT r.status, COUNT(*) AS count
       FROM requisitions r JOIN patients p ON p.id = r.patient_id
       ${baseWhere}
       GROUP BY r.status`,
      baseParams,
    ),
  ]);

  const statusCounts = { RECEIVED: 0, REPORT_ENTERED: 0, VERIFIED: 0 } as Record<string, number>;
  for (const row of counts.rows) statusCounts[row.status] = Number(row.count);
  const total = q.status
    ? statusCounts[q.status]
    : Object.values(statusCounts).reduce((sum, n) => sum + n, 0);

  res.json({
    success: true,
    data: { items: items.rows, total, page: q.page, pageSize: q.pageSize, statusCounts },
  });
}

type ReportRow = { reported_by: number | null; [column: string]: unknown };

export async function getRequisition(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { rows } = await query(`${REQUISITION_SELECT} WHERE r.id = $1`, [id]);
  const requisition = rows[0];
  if (!requisition) throw new AppError(404, 'Requisition not found');

  const [general, antibiogram] = await Promise.all([
    query<ReportRow>(
      `SELECT id, reporting_datetime, specimen, investigation_done, report_findings,
              prepared_by, reported_by, is_verified, updated_at
       FROM general_reports WHERE requisition_id = $1`,
      [id],
    ),
    query<ReportRow>(
      `SELECT a.id, a.reporting_datetime, a.organism_isolated, a.grams_stain_remark,
              a.prepared_by, a.reported_by, a.is_verified, a.updated_at,
              COALESCE(
                json_agg(json_build_object('antibiotic_name', x.antibiotic_name, 'sensitivity_result', x.sensitivity_result)
                         ORDER BY x.id) FILTER (WHERE x.id IS NOT NULL),
                '[]'
              ) AS results
       FROM antibiogram_reports a
       LEFT JOIN antibiogram_results x ON x.antibiogram_report_id = a.id
       WHERE a.requisition_id = $1
       GROUP BY a.id`,
      [id],
    ),
  ]);

  const generalReport = general.rows[0] ?? null;
  const antibiogramReport = antibiogram.rows[0] ?? null;
  assertDoctorCanView(req.user!, [generalReport, antibiogramReport]);

  res.json({
    success: true,
    data: { ...requisition, general_report: generalReport, antibiogram_report: antibiogramReport },
  });
}

/** Doctors may only open a requisition when one of its reports names them as reporting doctor. */
function assertDoctorCanView(user: AuthUser, reports: ({ reported_by: number | null } | null)[]) {
  if (user.role !== 'DOCTOR') return;
  if (!user.staff_id || !reports.some((r) => r?.reported_by === user.staff_id)) {
    throw new AppError(403, 'Access denied: You can only view details for requisitions assigned to you');
  }
}

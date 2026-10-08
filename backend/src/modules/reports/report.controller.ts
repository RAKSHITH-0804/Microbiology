import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { writeAuditLog } from '../../utils/audit';
import { REPORT_LOCKED_MESSAGE } from '../../utils/reportLock';
import {
  AntibiogramReportInput,
  GeneralReportInput,
  ListReportsQuery,
  ReportType,
  VerifyReportParams,
} from './report.schema';

/** Locks the requisition row and rejects edits once it, or this kind of report, has been verified. */
async function lockEditableRequisition(
  client: PoolClient,
  requisitionId: number,
  reportTable: 'general_reports' | 'antibiogram_reports',
) {
  const { rows } = await client.query<{ id: number; lab_no: string; status: string; report_verified: boolean }>(
    `SELECT r.id, r.lab_no, r.status,
            EXISTS (SELECT 1 FROM ${reportTable} x WHERE x.requisition_id = r.id AND x.is_verified) AS report_verified
     FROM requisitions r WHERE r.id = $1 FOR UPDATE`,
    [requisitionId],
  );
  const requisition = rows[0];
  if (!requisition) throw new AppError(404, 'Requisition not found');
  if (requisition.status === 'VERIFIED' || requisition.report_verified) throw new AppError(400, REPORT_LOCKED_MESSAGE);
  return requisition;
}

async function assertStaff(client: PoolClient, preparedBy: number, reportedBy: number) {
  const { rows } = await client.query<{ id: number }>(
    'SELECT id FROM master_staff WHERE is_active AND id = ANY($1::int[])',
    [[preparedBy, reportedBy]],
  );
  const found = new Set(rows.map((r) => r.id));
  const errors: Record<string, string[]> = {};
  if (!found.has(preparedBy)) errors.prepared_by = ['Unknown staff member'];
  if (!found.has(reportedBy)) errors.reported_by = ['Unknown staff member'];
  if (Object.keys(errors).length) throw new AppError(400, 'Invalid staff selection', errors);
}

async function markReportEntered(client: PoolClient, requisitionId: number) {
  await client.query(`UPDATE requisitions SET status = 'REPORT_ENTERED' WHERE id = $1 AND status = 'RECEIVED'`, [
    requisitionId,
  ]);
}

export async function saveGeneralReport(req: Request, res: Response) {
  const input = req.body as GeneralReportInput;
  const userId = req.user!.sub;

  const report = await withTransaction(async (client) => {
    const requisition = await lockEditableRequisition(client, input.requisition_id, 'general_reports');
    await assertStaff(client, input.prepared_by, input.reported_by);

    const { rows } = await client.query<{ id: number; created: boolean; reporting_datetime: Date }>(
      `INSERT INTO general_reports (requisition_id, specimen, investigation_done, report_findings, prepared_by, reported_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (requisition_id) DO UPDATE SET
         specimen = EXCLUDED.specimen,
         investigation_done = EXCLUDED.investigation_done,
         report_findings = EXCLUDED.report_findings,
         prepared_by = EXCLUDED.prepared_by,
         reported_by = EXCLUDED.reported_by,
         reporting_datetime = NOW()
       RETURNING id, (xmax = 0) AS created, reporting_datetime`,
      [input.requisition_id, input.specimen, input.investigation_done, input.report_findings, input.prepared_by, input.reported_by],
    );
    await markReportEntered(client, input.requisition_id);

    await writeAuditLog(
      {
        userId,
        action: rows[0].created ? 'CREATE' : 'UPDATE',
        entityName: 'general_reports',
        entityId: rows[0].id,
        details: { requisition_id: requisition.id, lab_no: requisition.lab_no },
      },
      client,
    );
    return {
      id: rows[0].id,
      requisition_id: requisition.id,
      lab_no: requisition.lab_no,
      status: 'REPORT_ENTERED',
      reporting_datetime: rows[0].reporting_datetime,
    };
  });

  res.json({ success: true, message: `General report saved for Lab No ${report.lab_no}`, data: report });
}

export async function saveAntibiogramReport(req: Request, res: Response) {
  const input = req.body as AntibiogramReportInput;
  const userId = req.user!.sub;

  const report = await withTransaction(async (client) => {
    const requisition = await lockEditableRequisition(client, input.requisition_id, 'antibiogram_reports');
    await assertStaff(client, input.prepared_by, input.reported_by);

    const { rows } = await client.query<{ id: number; created: boolean; reporting_datetime: Date }>(
      `INSERT INTO antibiogram_reports (requisition_id, organism_isolated, grams_stain_remark, prepared_by, reported_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (requisition_id) DO UPDATE SET
         organism_isolated = EXCLUDED.organism_isolated,
         grams_stain_remark = EXCLUDED.grams_stain_remark,
         prepared_by = EXCLUDED.prepared_by,
         reported_by = EXCLUDED.reported_by,
         reporting_datetime = NOW()
       RETURNING id, (xmax = 0) AS created, reporting_datetime`,
      [input.requisition_id, input.organism_isolated, input.grams_stain_remark, input.prepared_by, input.reported_by],
    );
    const reportId = rows[0].id;

    await client.query('DELETE FROM antibiogram_results WHERE antibiogram_report_id = $1', [reportId]);
    await client.query(
      `INSERT INTO antibiogram_results (antibiogram_report_id, antibiotic_name, sensitivity_result)
       SELECT $1, name, result::sensitivity_result
       FROM UNNEST($2::text[], $3::text[]) WITH ORDINALITY AS r(name, result, ord)
       ORDER BY ord`,
      [reportId, input.results.map((r) => r.antibiotic_name), input.results.map((r) => r.sensitivity_result)],
    );
    await markReportEntered(client, input.requisition_id);

    await writeAuditLog(
      {
        userId,
        action: rows[0].created ? 'CREATE' : 'UPDATE',
        entityName: 'antibiogram_reports',
        entityId: reportId,
        details: {
          requisition_id: requisition.id,
          lab_no: requisition.lab_no,
          organism: input.organism_isolated,
          antibiotics: input.results.length,
        },
      },
      client,
    );
    return {
      id: reportId,
      requisition_id: requisition.id,
      lab_no: requisition.lab_no,
      status: 'REPORT_ENTERED',
      reporting_datetime: rows[0].reporting_datetime,
    };
  });

  res.json({ success: true, message: `Antibiogram report saved for Lab No ${report.lab_no}`, data: report });
}

const REPORT_TABLES: Record<ReportType, 'general_reports' | 'antibiogram_reports'> = {
  general: 'general_reports',
  antibiogram: 'antibiogram_reports',
};

const unverifiedFrom = (type: ReportType) => `
  SELECT '${type}' AS report_type, x.id AS report_id, x.requisition_id, x.reporting_datetime,
         x.prepared_by, x.reported_by
  FROM ${REPORT_TABLES[type]} x
  WHERE NOT x.is_verified`;

export async function listUnverifiedReports(_req: Request, res: Response) {
  const { rows } = await query(
    `SELECT u.report_type, u.report_id, u.requisition_id, u.reporting_datetime,
            r.lab_no, r.receipt_no, r.sample_nature, r.hospital,
            json_build_object(
              'id', p.id, 'name', p.name, 'age_value', p.age_value, 'age_unit', p.age_unit,
              'age_years', p.age_years, 'age_months', p.age_months, 'age_days', p.age_days,
              'sex', p.sex, 'phone', p.phone
            ) AS patient,
            u.prepared_by, ps.name AS prepared_by_name,
            u.reported_by, rs.name AS reported_by_name, rs.designation AS reported_by_designation
     FROM (${unverifiedFrom('general')} UNION ALL ${unverifiedFrom('antibiogram')}) u
     JOIN requisitions r ON r.id = u.requisition_id AND r.status = 'REPORT_ENTERED'
     JOIN patients p ON p.id = r.patient_id
     LEFT JOIN master_staff ps ON ps.id = u.prepared_by
     LEFT JOIN master_staff rs ON rs.id = u.reported_by
     ORDER BY u.reporting_datetime ASC, u.report_id ASC`,
  );
  res.json({ success: true, data: rows });
}

const archiveFrom = (type: ReportType) => `
  SELECT '${type}' AS report_type, x.id AS report_id, x.requisition_id, x.reporting_datetime,
         ${type === 'general' ? 'x.investigation_done' : 'x.organism_isolated'} AS summary,
         x.prepared_by, x.reported_by, x.is_verified, x.verified_by, x.verified_at, x.created_at
  FROM ${REPORT_TABLES[type]} x`;

export async function listReports(req: Request, res: Response) {
  const q = req.query as unknown as ListReportsQuery;
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    conditions.push(sql(`$${params.length}`));
  };

  if (q.search) {
    add((p) => `(r.lab_no ILIKE ${p} OR p.name ILIKE ${p})`, `%${q.search.replace(/[\\%_]/g, '\\$&')}%`);
  }
  if (q.isVerified !== undefined) add((p) => `u.is_verified = ${p}`, q.isVerified);

  const source = q.type
    ? archiveFrom(q.type)
    : `${archiveFrom('general')} UNION ALL ${archiveFrom('antibiogram')}`;
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const from = `FROM (${source}) u
     JOIN requisitions r ON r.id = u.requisition_id
     JOIN patients p ON p.id = r.patient_id`;

  const [items, total] = await Promise.all([
    query(
      `SELECT u.report_type, u.report_id, u.requisition_id, u.reporting_datetime, u.summary,
              u.is_verified, u.verified_at, u.created_at,
              r.lab_no, r.receipt_no, r.sample_nature, r.status AS requisition_status,
              json_build_object(
                'id', p.id, 'name', p.name, 'age_value', p.age_value, 'age_unit', p.age_unit,
                'age_years', p.age_years, 'age_months', p.age_months, 'age_days', p.age_days,
                'sex', p.sex, 'phone', p.phone
              ) AS patient,
              ps.name AS prepared_by_name,
              rs.name AS reported_by_name, rs.designation AS reported_by_designation,
              vs.name AS verified_by_name
       ${from}
       LEFT JOIN master_staff ps ON ps.id = u.prepared_by
       LEFT JOIN master_staff rs ON rs.id = u.reported_by
       LEFT JOIN master_staff vs ON vs.id = u.verified_by
       ${where}
       ORDER BY u.created_at DESC, u.report_id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.pageSize, (q.page - 1) * q.pageSize],
    ),
    query<{ count: string }>(`SELECT COUNT(*) ${from} ${where}`, params),
  ]);

  res.json({
    success: true,
    data: { items: items.rows, total: Number(total.rows[0].count), page: q.page, pageSize: q.pageSize },
  });
}

export async function verifyReport(req: Request, res: Response) {
  const { type, id } = req.params as unknown as VerifyReportParams;
  const userId = req.user!.sub;
  const table = REPORT_TABLES[type];

  const result = await withTransaction(async (client) => {
    const staff = await client.query<{ staff_id: number | null }>('SELECT staff_id FROM users WHERE id = $1', [userId]);
    const staffId = staff.rows[0]?.staff_id;
    if (!staffId) throw new AppError(400, 'Your account is not linked to a staff member, so it cannot sign verifications');

    const { rows } = await client.query<{ requisition_id: number; is_verified: boolean; lab_no: string; status: string }>(
      `SELECT x.requisition_id, x.is_verified, r.lab_no, r.status
       FROM ${table} x JOIN requisitions r ON r.id = x.requisition_id
       WHERE x.id = $1
       FOR UPDATE OF x, r`,
      [id],
    );
    const report = rows[0];
    if (!report) throw new AppError(404, 'Report not found');
    if (report.is_verified || report.status === 'VERIFIED') throw new AppError(409, 'This report has already been verified');

    const updated = await client.query<{ verified_at: Date }>(
      `UPDATE ${table} SET is_verified = TRUE, verified_by = $2, verified_at = NOW() WHERE id = $1 RETURNING verified_at`,
      [id, staffId],
    );

    // The requisition is verified once none of its reports is still awaiting verification.
    const status = await client.query<{ status: string }>(
      `UPDATE requisitions r
       SET status = CASE
         WHEN EXISTS (SELECT 1 FROM general_reports WHERE requisition_id = r.id AND NOT is_verified)
           OR EXISTS (SELECT 1 FROM antibiogram_reports WHERE requisition_id = r.id AND NOT is_verified)
         THEN r.status ELSE 'VERIFIED' END
       WHERE r.id = $1
       RETURNING r.status`,
      [report.requisition_id],
    );

    await writeAuditLog(
      {
        userId,
        action: 'VERIFY',
        entityName: table,
        entityId: id,
        details: {
          requisition_id: report.requisition_id,
          lab_no: report.lab_no,
          verified_by_staff_id: staffId,
          requisition_status: status.rows[0].status,
        },
      },
      client,
    );

    return {
      report_type: type,
      report_id: id,
      requisition_id: report.requisition_id,
      lab_no: report.lab_no,
      requisition_status: status.rows[0].status,
      verified_at: updated.rows[0].verified_at,
    };
  });

  res.json({ success: true, message: `Report for Lab No ${result.lab_no} verified and locked`, data: result });
}

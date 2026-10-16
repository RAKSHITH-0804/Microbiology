import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { writeAuditLog } from '../../utils/audit';
import { AuthUser } from '../../utils/jwt';
import { assertNotCancelled, REPORT_LOCKED_MESSAGE } from '../../utils/reportLock';
import { PaymentStatus, RELEASED_PAYMENT_STATUSES } from '../requisitions/payment';
import { assignedToDoctor } from '../requisitions/requisition.controller';
import {
  AntibiogramReportInput,
  GeneralReportInput,
  ListReportsQuery,
  PrintLogParams,
  ReportType,
  RevokeVerificationInput,
  VerifyReportParams,
} from './report.schema';
import { ChangeMap, diffFields, REPORT_TABLES, ReportTable, reportLabel, resetVerification, VerifiedReport } from './verification';

/**
 * Locks the requisition row and rejects edits once it, or this kind of report, has been verified.
 * The HOD may still correct a verified report; saving a change resets its verification.
 */
async function lockEditableRequisition(client: PoolClient, requisitionId: number, reportTable: ReportTable, user: AuthUser) {
  const { rows } = await client.query<{
    id: number;
    lab_no: string;
    status: string;
    payment_status: string;
    cancelled_at: Date | null;
    report_verified: boolean;
  }>(
    `SELECT r.id, r.lab_no, r.status, r.payment_status, r.cancelled_at,
            EXISTS (SELECT 1 FROM ${reportTable} x WHERE x.requisition_id = r.id AND x.is_verified) AS report_verified
     FROM requisitions r WHERE r.id = $1 FOR UPDATE`,
    [requisitionId],
  );
  const requisition = rows[0];
  if (!requisition) throw new AppError(404, 'Requisition not found');
  assertNotCancelled(requisition);
  if ((requisition.status === 'VERIFIED' || requisition.report_verified) && user.role !== 'HOD') {
    throw new AppError(400, REPORT_LOCKED_MESSAGE);
  }
  if (!RELEASED_PAYMENT_STATUSES.includes(requisition.payment_status as PaymentStatus)) {
    throw new AppError(
      400,
      `Payment pending for ${requisition.lab_no} (${requisition.payment_status}). Record full payment or mark it exempt before entering reports.`,
    );
  }
  return requisition;
}

const AUTHOR_ONLY_MESSAGE = 'You can only author reports assigned to yourself';
const NOT_ASSIGNED_MESSAGE = 'Access denied: Requisitions must be assigned to you by lab staff before entering results';

/**
 * A doctor must name themselves as reporting doctor, cannot overwrite a report assigned to another
 * doctor, and may only work on requisitions where lab staff already assigned them a report.
 * Lab technicians and the HOD may prepare reports for any doctor.
 */
async function assertDoctorAuthorship(
  client: PoolClient,
  user: AuthUser,
  reportTable: 'general_reports' | 'antibiogram_reports',
  requisitionId: number,
  reportedBy: number,
) {
  if (user.role !== 'DOCTOR') return;
  if (!user.staff_id || reportedBy !== user.staff_id) throw new AppError(403, AUTHOR_ONLY_MESSAGE);
  const { rows } = await client.query<{ report_table: string; reported_by: number | null }>(
    `SELECT 'general_reports' AS report_table, reported_by FROM general_reports WHERE requisition_id = $1
     UNION ALL
     SELECT 'antibiogram_reports', reported_by FROM antibiogram_reports WHERE requisition_id = $1`,
    [requisitionId],
  );
  const current = rows.find((r) => r.report_table === reportTable);
  if (current && current.reported_by !== user.staff_id) throw new AppError(403, AUTHOR_ONLY_MESSAGE);
  if (!rows.some((r) => r.reported_by === user.staff_id)) throw new AppError(403, NOT_ASSIGNED_MESSAGE);
}

/** Who saved the report, recorded in the audit trail alongside the acting user id. */
const authoredBy = (user: AuthUser) => ({
  user_id: user.sub,
  username: user.username,
  role: user.role,
  staff_id: user.staff_id,
});

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

/** A saved report always leaves the requisition awaiting verification (only the HOD can save on a verified one). */
async function markReportEntered(client: PoolClient, requisitionId: number) {
  await client.query(
    `UPDATE requisitions SET status = 'REPORT_ENTERED' WHERE id = $1 AND status IN ('RECEIVED', 'VERIFIED')`,
    [requisitionId],
  );
}

type ExistingReport = VerifiedReport & { is_verified: boolean } & Record<string, unknown>;

/** The current report row, locked, so the save can record what it changed. */
async function existingReport(client: PoolClient, table: ReportTable, requisitionId: number, columns: readonly string[]) {
  const { rows } = await client.query<ExistingReport>(
    `SELECT id, ${columns.join(', ')}, is_verified, verified_by, verified_at
     FROM ${table} WHERE requisition_id = $1 FOR UPDATE`,
    [requisitionId],
  );
  return rows[0];
}

/** Resets verification when the HOD saved a change to a verified report. */
async function resetAfterCorrection(
  client: PoolClient,
  user: AuthUser,
  table: ReportTable,
  before: ExistingReport | undefined,
  requisition: { id: number; lab_no: string },
  changes: ChangeMap,
) {
  if (!before?.is_verified) return false;
  await resetVerification(client, {
    table,
    report: before,
    requisition,
    actorId: user.sub,
    action: 'VERIFICATION_RESET',
    details: { trigger: 'report_edit', changes },
    message: `The HOD corrected the verified ${reportLabel(table)} for ${requisition.lab_no}. Please review and verify it again.`,
  });
  return true;
}

const UNCHANGED_VERIFIED_MESSAGE = 'No changes to save; the report is still verified';

const GENERAL_FIELDS = ['specimen', 'investigation_done', 'report_findings', 'prepared_by', 'reported_by'] as const;

export async function saveGeneralReport(req: Request, res: Response) {
  const input = req.body as GeneralReportInput;
  const userId = req.user!.sub;

  const report = await withTransaction(async (client) => {
    const requisition = await lockEditableRequisition(client, input.requisition_id, 'general_reports', req.user!);
    await assertDoctorAuthorship(client, req.user!, 'general_reports', input.requisition_id, input.reported_by);
    await assertStaff(client, input.prepared_by, input.reported_by);

    const before = await existingReport(client, 'general_reports', input.requisition_id, GENERAL_FIELDS);
    const changes = await diffFields(client, before, {
      specimen: input.specimen,
      investigation_done: input.investigation_done,
      report_findings: input.report_findings,
      prepared_by: input.prepared_by,
      reported_by: input.reported_by,
    });
    if (before?.is_verified && !Object.keys(changes).length) throw new AppError(409, UNCHANGED_VERIFIED_MESSAGE);

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
        details: {
          requisition_id: requisition.id,
          lab_no: requisition.lab_no,
          reported_by: input.reported_by,
          authored_by: authoredBy(req.user!),
          changes,
        },
      },
      client,
    );
    const verificationReset = await resetAfterCorrection(client, req.user!, 'general_reports', before, requisition, changes);
    return {
      id: rows[0].id,
      requisition_id: requisition.id,
      lab_no: requisition.lab_no,
      status: 'REPORT_ENTERED',
      reporting_datetime: rows[0].reporting_datetime,
      verification_reset: verificationReset,
    };
  });

  res.json({ success: true, message: savedMessage('General', report), data: report });
}

const savedMessage = (kind: string, report: { lab_no: string; verification_reset: boolean }) =>
  report.verification_reset
    ? `${kind} report corrected for Lab No ${report.lab_no}; verification was reset and the reporting doctor notified`
    : `${kind} report saved for Lab No ${report.lab_no}`;

/** Per-antibiotic differences, e.g. "Sensitivity: Amikacin" S -> R; added and removed rows show an empty side. */
function sensitivityChanges(
  before: { antibiotic_name: string; sensitivity_result: string }[],
  after: AntibiogramReportInput['results'],
): ChangeMap {
  const changes: ChangeMap = {};
  const old = new Map(before.map((r) => [r.antibiotic_name.toLowerCase(), r]));
  for (const r of after) {
    const prev = old.get(r.antibiotic_name.toLowerCase());
    old.delete(r.antibiotic_name.toLowerCase());
    if (prev?.sensitivity_result !== r.sensitivity_result) {
      changes[`Sensitivity: ${r.antibiotic_name}`] = { from: prev?.sensitivity_result ?? null, to: r.sensitivity_result };
    }
  }
  for (const r of old.values()) changes[`Sensitivity: ${r.antibiotic_name}`] = { from: r.sensitivity_result, to: null };
  return changes;
}

const ANTIBIOGRAM_FIELDS = ['organism_isolated', 'grams_stain_remark', 'prepared_by', 'reported_by'] as const;

export async function saveAntibiogramReport(req: Request, res: Response) {
  const input = req.body as AntibiogramReportInput;
  const userId = req.user!.sub;

  const report = await withTransaction(async (client) => {
    const requisition = await lockEditableRequisition(client, input.requisition_id, 'antibiogram_reports', req.user!);
    await assertDoctorAuthorship(client, req.user!, 'antibiogram_reports', input.requisition_id, input.reported_by);
    await assertStaff(client, input.prepared_by, input.reported_by);

    const before = await existingReport(client, 'antibiogram_reports', input.requisition_id, ANTIBIOGRAM_FIELDS);
    const beforeResults = before
      ? (
          await client.query<{ antibiotic_name: string; sensitivity_result: string }>(
            'SELECT antibiotic_name, sensitivity_result FROM antibiogram_results WHERE antibiogram_report_id = $1 ORDER BY id',
            [before.id],
          )
        ).rows
      : [];
    const changes = {
      ...(await diffFields(client, before, {
        organism_isolated: input.organism_isolated,
        grams_stain_remark: input.grams_stain_remark,
        prepared_by: input.prepared_by,
        reported_by: input.reported_by,
      })),
      ...sensitivityChanges(beforeResults, input.results),
    };
    if (before?.is_verified && !Object.keys(changes).length) throw new AppError(409, UNCHANGED_VERIFIED_MESSAGE);

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
          reported_by: input.reported_by,
          authored_by: authoredBy(req.user!),
          changes,
        },
      },
      client,
    );
    const verificationReset = await resetAfterCorrection(client, req.user!, 'antibiogram_reports', before, requisition, changes);
    return {
      id: reportId,
      requisition_id: requisition.id,
      lab_no: requisition.lab_no,
      status: 'REPORT_ENTERED',
      reporting_datetime: rows[0].reporting_datetime,
      verification_reset: verificationReset,
    };
  });

  res.json({ success: true, message: savedMessage('Antibiogram', report), data: report });
}

const unverifiedFrom = (type: ReportType) => `
  SELECT '${type}' AS report_type, x.id AS report_id, x.requisition_id, x.reporting_datetime,
         x.prepared_by, x.reported_by
  FROM ${REPORT_TABLES[type]} x
  WHERE NOT x.is_verified`;

export async function listUnverifiedReports(req: Request, res: Response) {
  const { role, staff_id: staffId } = req.user!;
  // Doctors see only the reports naming them as the reporting doctor; the HOD sees every pending report.
  const doctorOnly = role === 'DOCTOR';
  if (doctorOnly && !staffId) {
    res.json({ success: true, data: [] });
    return;
  }

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
     JOIN requisitions r ON r.id = u.requisition_id AND r.status = 'REPORT_ENTERED' AND r.cancelled_at IS NULL
     JOIN patients p ON p.id = r.patient_id
     LEFT JOIN master_staff ps ON ps.id = u.prepared_by
     LEFT JOIN master_staff rs ON rs.id = u.reported_by
     ${doctorOnly ? 'WHERE u.reported_by = $1' : ''}
     ORDER BY u.reporting_datetime ASC, u.report_id ASC`,
    doctorOnly ? [staffId] : [],
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

  // Doctors see only reports naming them as reporting doctor; the HOD and lab staff see the whole department.
  const { role, staff_id: staffId } = req.user!;
  if (role === 'DOCTOR') {
    if (!staffId) {
      res.json({ success: true, data: { items: [], total: 0, page: q.page, pageSize: q.pageSize } });
      return;
    }
    add((p) => `u.reported_by = ${p}`, staffId);
  }

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
              r.lab_no, r.receipt_no, r.sample_nature, r.status AS requisition_status, r.cancelled_at,
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
  const { sub: userId, role, staff_id: staffId } = req.user!;
  const table = REPORT_TABLES[type];
  if (!staffId) throw new AppError(400, 'Your account is not linked to a staff member, so it cannot sign verifications');

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query<{
      requisition_id: number;
      reported_by: number | null;
      is_verified: boolean;
      lab_no: string;
      status: string;
      cancelled_at: Date | null;
    }>(
      `SELECT x.requisition_id, x.reported_by, x.is_verified, r.lab_no, r.status, r.cancelled_at
       FROM ${table} x JOIN requisitions r ON r.id = x.requisition_id
       WHERE x.id = $1
       FOR UPDATE OF x, r`,
      [id],
    );
    const report = rows[0];
    if (!report) throw new AppError(404, 'Report not found');
    assertNotCancelled(report);
    if (role !== 'HOD' && report.reported_by !== staffId) {
      throw new AppError(403, 'You can only verify reports assigned to you');
    }
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

/** HOD only: sends a verified report back to its reporting doctor, with a written reason. */
export async function revokeVerification(req: Request, res: Response) {
  const { type, id } = req.params as unknown as VerifyReportParams;
  const { reason } = req.body as RevokeVerificationInput;
  const table = REPORT_TABLES[type];

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query<
      VerifiedReport & { requisition_id: number; is_verified: boolean; lab_no: string; cancelled_at: Date | null }
    >(
      `SELECT x.id, x.requisition_id, x.reported_by, x.is_verified, x.verified_by, x.verified_at, r.lab_no, r.cancelled_at
       FROM ${table} x JOIN requisitions r ON r.id = x.requisition_id
       WHERE x.id = $1
       FOR UPDATE OF x, r`,
      [id],
    );
    const report = rows[0];
    if (!report) throw new AppError(404, 'Report not found');
    assertNotCancelled(report);
    if (!report.is_verified) throw new AppError(409, 'This report is not verified, so there is nothing to revoke');

    await resetVerification(client, {
      table,
      report,
      requisition: { id: report.requisition_id, lab_no: report.lab_no },
      actorId: req.user!.sub,
      action: 'REPORT_VERIFICATION_REVOKED',
      details: { reason },
      message: `The HOD revoked verification of the ${reportLabel(table)} for ${report.lab_no}: ${reason}`,
    });
    return { report_type: type, report_id: id, requisition_id: report.requisition_id, lab_no: report.lab_no };
  });

  res.json({
    success: true,
    message: `Verification revoked for Lab No ${result.lab_no}; the reporting doctor has been asked to verify it again`,
    data: { ...result, requisition_status: 'REPORT_ENTERED' },
  });
}

/**
 * Records that a report was printed. Whether it printed as a draft is taken from the saved report,
 * not from the client. Doctors may only log reports assigned to them.
 */
export async function logReportPrint(req: Request, res: Response) {
  const { type, requisitionId } = req.params as unknown as PrintLogParams;
  const { role, staff_id: staffId } = req.user!;
  const table = REPORT_TABLES[type];

  const { rows } = await query<{ id: number; is_verified: boolean; lab_no: string; assigned: boolean }>(
    `SELECT x.id, x.is_verified, r.lab_no, COALESCE(${assignedToDoctor('$2')}, FALSE) AS assigned
     FROM ${table} x JOIN requisitions r ON r.id = x.requisition_id
     WHERE x.requisition_id = $1`,
    [requisitionId, staffId ?? null],
  );
  const report = rows[0];
  if (role === 'DOCTOR' && !report?.assigned) {
    throw new AppError(403, 'Access denied: You can only view details for requisitions assigned to you');
  }
  if (!report) throw new AppError(404, 'Save the report before printing it');

  await writeAuditLog({
    userId: req.user!.sub,
    action: 'REPORT_PRINT',
    entityName: table,
    entityId: report.id,
    details: {
      requisition_id: requisitionId,
      lab_no: report.lab_no,
      report_type: type,
      report_id: report.id,
      draft: !report.is_verified,
    },
  });
  res.status(201).json({ success: true, data: { draft: !report.is_verified } });
}

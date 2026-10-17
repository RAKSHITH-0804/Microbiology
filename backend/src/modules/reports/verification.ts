import { PoolClient } from 'pg';
import { writeAuditLog } from '../../utils/audit';
import { notifyStaff } from '../notifications/notification.service';
import type { ReportType } from './report.schema';
import { clearReviewMarksForReport } from './reviewContent';

export type ReportTable = 'general_reports' | 'antibiogram_reports';

export const REPORT_TABLES: Record<ReportType, ReportTable> = {
  general: 'general_reports',
  antibiogram: 'antibiogram_reports',
};

const REPORT_TYPE_OF: Record<ReportTable, ReportType> = {
  general_reports: 'general',
  antibiogram_reports: 'antibiogram',
};

const REPORT_LABEL: Record<ReportTable, string> = {
  general_reports: 'general report',
  antibiogram_reports: 'antibiogram report',
};

export type FieldChange = { from: unknown; to: unknown };
export type ChangeMap = Record<string, FieldChange>;

const STAFF_FIELDS = ['prepared_by', 'reported_by'];

/** Staff names by id, for audit entries that should read "Dr. A -> Dr. B" rather than ids. */
async function staffNames(client: PoolClient, ids: unknown[]): Promise<Map<number, string>> {
  const numeric = ids.filter((id): id is number => typeof id === 'number');
  if (!numeric.length) return new Map();
  const { rows } = await client.query<{ id: number; name: string }>(
    'SELECT id, name FROM master_staff WHERE id = ANY($1::int[])',
    [numeric],
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Fields of `after` whose value differs from `before`; staff ids are reported as names. */
export async function diffFields(
  client: PoolClient,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
): Promise<ChangeMap> {
  const changes: ChangeMap = {};
  for (const [key, value] of Object.entries(after)) {
    const from = before?.[key] ?? null;
    const to = value ?? null;
    if (from !== to) changes[key] = { from, to };
  }
  const staffChanges = STAFF_FIELDS.filter((k) => changes[k]);
  if (staffChanges.length) {
    const names = await staffNames(client, staffChanges.flatMap((k) => [changes[k].from, changes[k].to]));
    const name = (id: unknown) => (typeof id === 'number' ? (names.get(id) ?? `Staff #${id}`) : null);
    for (const k of staffChanges) changes[k] = { from: name(changes[k].from), to: name(changes[k].to) };
  }
  return changes;
}

export interface VerifiedReport {
  id: number;
  reported_by: number | null;
  verified_by: number | null;
  verified_at: Date | null;
}

interface ResetOptions {
  table: ReportTable;
  report: VerifiedReport;
  requisition: { id: number; lab_no: string };
  actorId: number;
  action: 'REPORT_VERIFICATION_REVOKED' | 'VERIFICATION_RESET';
  details: Record<string, unknown>;
  /** Shown to the reporting doctor. */
  message: string;
}

/**
 * Takes a verified report back to "awaiting verification": the reporting doctor is notified and must
 * verify it again before the report can be printed as final.
 */
export async function resetVerification(client: PoolClient, o: ResetOptions) {
  await client.query(
    `UPDATE ${o.table} SET is_verified = FALSE, verified_by = NULL, verified_at = NULL WHERE id = $1`,
    [o.report.id],
  );
  await clearReviewMarksForReport(client, REPORT_TYPE_OF[o.table], o.report.id);
  await client.query(`UPDATE requisitions SET status = 'REPORT_ENTERED' WHERE id = $1`, [o.requisition.id]);

  const previous = await staffNames(client, [o.report.verified_by]);
  await writeAuditLog(
    {
      userId: o.actorId,
      action: o.action,
      entityName: o.table,
      entityId: o.report.id,
      details: {
        requisition_id: o.requisition.id,
        lab_no: o.requisition.lab_no,
        report_type: REPORT_TYPE_OF[o.table],
        previously_verified_by: o.report.verified_by ? (previous.get(o.report.verified_by) ?? null) : null,
        previously_verified_at: o.report.verified_at,
        ...o.details,
      },
    },
    client,
  );
  await notifyStaff(client, [o.report.reported_by], {
    type: 'ALERT',
    title: `Re-verify ${REPORT_LABEL[o.table]} ${o.requisition.lab_no}`,
    message: o.message,
    link: `/reports/${REPORT_TYPE_OF[o.table]}/${o.requisition.id}`,
    entityName: o.table,
    entityId: o.report.id,
  });
}

export const reportLabel = (table: ReportTable) => REPORT_LABEL[table];

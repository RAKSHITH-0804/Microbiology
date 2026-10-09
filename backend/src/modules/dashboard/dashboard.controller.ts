import { Request, Response } from 'express';
import { query } from '../../config/db';
import { assignedToDoctor, REQUISITION_SELECT } from '../requisitions/requisition.controller';

interface CountsRow {
  samples_today: string;
  pending_reports: string;
  awaiting_verification: string;
  verified_this_week: string;
}

const DEPARTMENT_COUNTS = `
  SELECT
    (SELECT COUNT(*) FROM requisitions WHERE created_at >= date_trunc('day', NOW())) AS samples_today,
    (SELECT COUNT(*) FROM requisitions WHERE status = 'RECEIVED' AND payment_status IN ('PAID', 'EXEMPT')) AS pending_reports,
    (SELECT COUNT(*) FROM requisitions WHERE status = 'REPORT_ENTERED') AS awaiting_verification,
    (SELECT COUNT(*)
     FROM requisitions r
     WHERE r.status = 'VERIFIED'
       AND GREATEST(
             (SELECT MAX(g.verified_at) FROM general_reports g WHERE g.requisition_id = r.id),
             (SELECT MAX(a.verified_at) FROM antibiogram_reports a WHERE a.requisition_id = r.id)
           ) >= NOW() - INTERVAL '7 days') AS verified_this_week`;

/** Counts over reports whose reporting doctor is $1 (a NULL staff id matches nothing). */
const DOCTOR_COUNTS = `
  WITH my_reports AS (
    SELECT requisition_id, is_verified, verified_at FROM general_reports WHERE reported_by = $1
    UNION ALL
    SELECT requisition_id, is_verified, verified_at FROM antibiogram_reports WHERE reported_by = $1
  )
  SELECT
    (SELECT COUNT(*) FROM requisitions r
     WHERE r.created_at >= date_trunc('day', NOW()) AND r.id IN (SELECT requisition_id FROM my_reports)) AS samples_today,
    (SELECT COUNT(*) FROM my_reports WHERE NOT is_verified) AS pending_reports,
    (SELECT COUNT(*) FROM my_reports WHERE NOT is_verified) AS awaiting_verification,
    (SELECT COUNT(*) FROM my_reports
     WHERE is_verified AND verified_at >= NOW() - INTERVAL '7 days') AS verified_this_week`;

const RECENT_ORDER = 'ORDER BY r.created_at DESC, r.id DESC LIMIT 10';

export async function getDashboardStats(req: Request, res: Response) {
  const user = req.user!;
  const isDoctor = user.role === 'DOCTOR';

  const [counts, recent] = await Promise.all(
    isDoctor
      ? [
          query<CountsRow>(DOCTOR_COUNTS, [user.staff_id]),
          query(`${REQUISITION_SELECT} WHERE ${assignedToDoctor('$1')} ${RECENT_ORDER}`, [user.staff_id]),
        ]
      : [query<CountsRow>(DEPARTMENT_COUNTS), query(`${REQUISITION_SELECT} ${RECENT_ORDER}`)],
  );

  const c = counts.rows[0];
  res.json({
    success: true,
    data: {
      samplesToday: Number(c.samples_today),
      pendingReports: Number(c.pending_reports),
      awaitingVerification: Number(c.awaiting_verification),
      verifiedThisWeek: Number(c.verified_this_week),
      recentRequisitions: recent.rows,
    },
  });
}

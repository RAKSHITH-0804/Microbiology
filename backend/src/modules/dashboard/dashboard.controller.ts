import { Request, Response } from 'express';
import { query } from '../../config/db';
import { REQUISITION_SELECT } from '../requisitions/requisition.controller';

interface CountsRow {
  samples_today: string;
  pending_reports: string;
  awaiting_verification: string;
  verified_this_week: string;
}

export async function getDashboardStats(_req: Request, res: Response) {
  const [counts, recent] = await Promise.all([
    query<CountsRow>(
      `SELECT
         (SELECT COUNT(*) FROM requisitions WHERE created_at >= date_trunc('day', NOW())) AS samples_today,
         (SELECT COUNT(*) FROM requisitions WHERE status = 'RECEIVED' AND payment_status IN ('PAID', 'EXEMPT')) AS pending_reports,
         (SELECT COUNT(*) FROM requisitions WHERE status = 'REPORT_ENTERED') AS awaiting_verification,
         (SELECT COUNT(*)
          FROM requisitions r
          WHERE r.status = 'VERIFIED'
            AND GREATEST(
                  (SELECT MAX(g.verified_at) FROM general_reports g WHERE g.requisition_id = r.id),
                  (SELECT MAX(a.verified_at) FROM antibiogram_reports a WHERE a.requisition_id = r.id)
                ) >= NOW() - INTERVAL '7 days') AS verified_this_week`,
    ),
    query(`${REQUISITION_SELECT} ORDER BY r.created_at DESC, r.id DESC LIMIT 10`),
  ]);

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

import { Request, Response } from 'express';
import { query } from '../../config/db';
import { UserRole } from '../../utils/jwt';
import { assignedToDoctor, REQUISITION_SELECT, withVisibleReferral } from '../requisitions/requisition.controller';

interface CountsRow {
  samples_today: string;
  pending_reports: string;
  awaiting_verification: string;
  verified_this_week: string;
}

const DEPARTMENT_COUNTS = `
  SELECT
    (SELECT COUNT(*) FROM requisitions WHERE created_at >= date_trunc('day', NOW())) AS samples_today,
    (SELECT COUNT(*) FROM requisitions
     WHERE status = 'RECEIVED' AND payment_status IN ('PAID', 'HOSPITAL_CREDIT', 'EXEMPT') AND cancelled_at IS NULL) AS pending_reports,
    (SELECT COUNT(*) FROM requisitions WHERE status = 'REPORT_ENTERED' AND cancelled_at IS NULL) AS awaiting_verification,
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
  ),
  my_open AS (
    SELECT m.* FROM my_reports m JOIN requisitions r ON r.id = m.requisition_id
    WHERE NOT m.is_verified AND r.cancelled_at IS NULL
  )
  SELECT
    (SELECT COUNT(*) FROM requisitions r
     WHERE r.created_at >= date_trunc('day', NOW()) AND r.id IN (SELECT requisition_id FROM my_reports)) AS samples_today,
    (SELECT COUNT(*) FROM my_open) AS pending_reports,
    (SELECT COUNT(*) FROM my_open) AS awaiting_verification,
    (SELECT COUNT(*) FROM my_reports
     WHERE is_verified AND verified_at >= NOW() - INTERVAL '7 days') AS verified_this_week`;

const RECENT_ORDER = 'ORDER BY r.created_at DESC, r.id DESC LIMIT 10';

/** Department-wide charts are for the HOD and the Super Admin only. */
const ANALYTICS_ROLES: readonly UserRole[] = ['HOD', 'SUPER_ADMIN'];

/** Requisitions per test family; "Bacteriology - Microscopy" and "Bacteriology - Culture" both count as Bacteriology. */
const CATEGORY_DISTRIBUTION = `
  SELECT split_part(t.test_category, ' - ', 1) AS category, COUNT(DISTINCT t.requisition_id)::int AS count
  FROM requisition_tests t
  GROUP BY 1
  ORDER BY count DESC, category`;

/** Samples received per calendar month, this year against last year. */
const YEARLY_COMPARISON = `
  SELECT m AS month,
         COUNT(r.id) FILTER (WHERE date_part('year', r.sample_received_datetime) = date_part('year', NOW()))::int AS current_year,
         COUNT(r.id) FILTER (WHERE date_part('year', r.sample_received_datetime) = date_part('year', NOW()) - 1)::int AS previous_year
  FROM generate_series(1, 12) AS m
  LEFT JOIN requisitions r
    ON date_part('month', r.sample_received_datetime) = m
   AND r.sample_received_datetime >= date_trunc('year', NOW()) - INTERVAL '1 year'
  GROUP BY m
  ORDER BY m`;

const ALL_REPORTS = `
  SELECT prepared_by, reported_by, verified_by, is_verified FROM general_reports
  UNION ALL
  SELECT prepared_by, reported_by, verified_by, is_verified FROM antibiogram_reports`;

/** Reports prepared per lab technician, split by whether a doctor has verified them yet. */
const LAB_TECH_PRODUCTIVITY = `
  WITH reports AS (${ALL_REPORTS})
  SELECT s.id, s.name,
         COUNT(r.prepared_by) FILTER (WHERE NOT r.is_verified)::int AS drafted,
         COUNT(r.prepared_by) FILTER (WHERE r.is_verified)::int AS verified,
         COUNT(r.prepared_by)::int AS total
  FROM master_staff s
  LEFT JOIN reports r ON r.prepared_by = s.id
  WHERE (s.is_active AND s.designation ILIKE '%lab%tech%') OR r.prepared_by IS NOT NULL
  GROUP BY s.id, s.name
  ORDER BY total DESC, s.name`;

/** Reports each doctor has verified, plus reports assigned to them still awaiting verification. */
const DOCTOR_PRODUCTIVITY = `
  WITH reports AS (${ALL_REPORTS})
  SELECT s.id, s.name,
         COUNT(r.*) FILTER (WHERE r.verified_by = s.id)::int AS verified,
         COUNT(r.*) FILTER (WHERE r.reported_by = s.id AND NOT r.is_verified)::int AS pending
  FROM master_staff s
  LEFT JOIN reports r ON s.id IN (r.verified_by, r.reported_by)
  WHERE (s.is_active AND s.staff_type = 'TEACHING') OR r.verified_by = s.id
  GROUP BY s.id, s.name
  ORDER BY verified DESC, pending DESC, s.name`;

async function loadAnalytics() {
  const [categories, yearly, techs, doctors] = await Promise.all([
    query<{ category: string; count: number }>(CATEGORY_DISTRIBUTION),
    query<{ month: number; current_year: number; previous_year: number }>(YEARLY_COMPARISON),
    query<{ id: number; name: string; drafted: number; verified: number; total: number }>(LAB_TECH_PRODUCTIVITY),
    query<{ id: number; name: string; verified: number; pending: number }>(DOCTOR_PRODUCTIVITY),
  ]);
  const year = new Date().getFullYear();
  return {
    categoryDistribution: categories.rows,
    yearlyComparison: {
      currentYear: year,
      previousYear: year - 1,
      months: yearly.rows.map((r) => ({ month: r.month, currentYear: r.current_year, previousYear: r.previous_year })),
    },
    labTechProductivity: techs.rows.map(({ total: _total, ...r }) => r),
    doctorProductivity: doctors.rows,
  };
}

export async function getDashboardStats(req: Request, res: Response) {
  const user = req.user!;
  const isDoctor = user.role === 'DOCTOR';

  const [counts, recent, analytics] = await Promise.all([
    isDoctor ? query<CountsRow>(DOCTOR_COUNTS, [user.staff_id]) : query<CountsRow>(DEPARTMENT_COUNTS),
    isDoctor
      ? query(`${REQUISITION_SELECT} WHERE ${assignedToDoctor('$1')} ${RECENT_ORDER}`, [user.staff_id])
      : query(`${REQUISITION_SELECT} ${RECENT_ORDER}`),
    ANALYTICS_ROLES.includes(user.role) ? loadAnalytics() : null,
  ]);

  const c = counts.rows[0];
  res.json({
    success: true,
    data: {
      samplesToday: Number(c.samples_today),
      pendingReports: Number(c.pending_reports),
      awaitingVerification: Number(c.awaiting_verification),
      verifiedThisWeek: Number(c.verified_this_week),
      recentRequisitions: withVisibleReferral(user, recent.rows),
      analytics,
    },
  });
}

import { Request, Response } from 'express';
import { query } from '../../config/db';
import { PAYMENT_MODES } from '../requisitions/payment';
import { PatientLedgerQuery, PaymentHistoryQuery, PaymentSummaryQuery } from './payment.schema';

/**
 * Billing is recorded on the requisition itself (there is no per-instalment ledger), so
 * every figure here is attributed to the date the requisition was registered (created_at).
 */
const BALANCE_DUE = `CASE WHEN r.payment_status = 'EXEMPT' THEN 0 ELSE r.total_amount - r.paid_amount END`;

function buildFilters(q: PaymentSummaryQuery & { search?: string }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    conditions.push(sql(`$${params.length}`));
  };

  if (q.startDate) add((p) => `r.created_at >= ${p}::date`, q.startDate);
  if (q.endDate) add((p) => `r.created_at < ${p}::date + 1`, q.endDate);
  if (q.paymentMode) add((p) => `r.payment_mode = ${p}`, q.paymentMode);
  if (q.paymentStatus) add((p) => `r.payment_status = ${p}`, q.paymentStatus);
  if (q.search) {
    add(
      (p) => `(r.lab_no ILIKE ${p} OR p.name ILIKE ${p} OR p.phone ILIKE ${p})`,
      `%${q.search.replace(/[\\%_]/g, '\\$&')}%`,
    );
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

interface SummaryRow {
  today_collection: number;
  today_count: string;
  filtered_collection: number;
  filtered_billed: number;
  total_outstanding: number;
  exempt_total: number;
  exempt_count: string;
  transactions: string;
}

export async function getPaymentSummary(req: Request, res: Response) {
  const q = req.query as unknown as PaymentSummaryQuery;
  const { where, params } = buildFilters(q);
  const from = `FROM requisitions r JOIN patients p ON p.id = r.patient_id ${where}`;

  const [totals, modes] = await Promise.all([
    query<SummaryRow>(
      `SELECT
         (SELECT COALESCE(SUM(paid_amount), 0)::float8 FROM requisitions
           WHERE created_at >= date_trunc('day', NOW())) AS today_collection,
         (SELECT COUNT(*) FROM requisitions WHERE created_at >= date_trunc('day', NOW())) AS today_count,
         COALESCE(SUM(r.paid_amount), 0)::float8 AS filtered_collection,
         COALESCE(SUM(r.total_amount), 0)::float8 AS filtered_billed,
         COALESCE(SUM(${BALANCE_DUE}), 0)::float8 AS total_outstanding,
         COALESCE(SUM(r.total_amount) FILTER (WHERE r.payment_status = 'EXEMPT'), 0)::float8 AS exempt_total,
         COUNT(*) FILTER (WHERE r.payment_status = 'EXEMPT') AS exempt_count,
         COUNT(*) AS transactions
       ${from}`,
      params,
    ),
    query<{ mode: string | null; count: string; billed: number; collected: number; balance_due: number }>(
      `SELECT r.payment_mode AS mode, COUNT(*) AS count,
              COALESCE(SUM(r.total_amount), 0)::float8 AS billed,
              COALESCE(SUM(r.paid_amount), 0)::float8 AS collected,
              COALESCE(SUM(${BALANCE_DUE}), 0)::float8 AS balance_due
       ${from}
       GROUP BY r.payment_mode`,
      params,
    ),
  ]);

  const t = totals.rows[0];
  const byMode = new Map(modes.rows.map((m) => [m.mode, m]));
  const toBreakdown = (mode: string | null) => {
    const m = byMode.get(mode);
    return {
      mode: mode ?? 'NOT_RECORDED',
      count: Number(m?.count ?? 0),
      billed: m?.billed ?? 0,
      collected: m?.collected ?? 0,
      balance_due: m?.balance_due ?? 0,
    };
  };

  res.json({
    success: true,
    data: {
      today_collection: t.today_collection,
      today_count: Number(t.today_count),
      filtered_collection: t.filtered_collection,
      filtered_billed: t.filtered_billed,
      total_outstanding: t.total_outstanding,
      exempt_total: t.exempt_total,
      exempt_count: Number(t.exempt_count),
      transactions: Number(t.transactions),
      breakdown_by_mode: [...PAYMENT_MODES.map(toBreakdown), toBreakdown(null)],
    },
  });
}

const TRANSACTION_COLUMNS = `
  r.id, r.lab_no, r.created_at, r.sample_received_datetime, r.status,
  p.id AS patient_id, p.name AS patient_name, p.phone,
  r.total_amount::float8 AS total_amount, r.paid_amount::float8 AS paid_amount,
  (${BALANCE_DUE})::float8 AS balance_due, r.payment_mode, r.payment_status`;

export async function getPaymentHistory(req: Request, res: Response) {
  const q = req.query as unknown as PaymentHistoryQuery;
  const { where, params } = buildFilters(q);

  const [items, count] = await Promise.all([
    query(
      `SELECT ${TRANSACTION_COLUMNS}
       FROM requisitions r JOIN patients p ON p.id = r.patient_id
       ${where}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.limit, (q.page - 1) * q.limit],
    ),
    query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM requisitions r JOIN patients p ON p.id = r.patient_id ${where}`,
      params,
    ),
  ]);

  res.json({
    success: true,
    data: { items: items.rows, total: Number(count.rows[0].total), page: q.page, limit: q.limit },
  });
}

export async function getPatientLedger(req: Request, res: Response) {
  const q = req.query as unknown as PatientLedgerQuery;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (q.phone_no) {
    params.push(q.phone_no);
    conditions.push(`p.phone = $${params.length}`);
  }
  if (q.patient_name) {
    params.push(q.patient_name);
    conditions.push(`LOWER(p.name) = LOWER($${params.length})`);
  }

  const visits = await query<{
    patient_id: number;
    patient_name: string;
    phone: string | null;
    total_amount: number;
    paid_amount: number;
    balance_due: number;
  }>(
    `SELECT ${TRANSACTION_COLUMNS}, r.sample_nature
     FROM requisitions r JOIN patients p ON p.id = r.patient_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY r.created_at ASC, r.id ASC`,
    params,
  );

  const rows = visits.rows;
  const patients = [
    ...new Map(rows.map((v) => [v.patient_id, { id: v.patient_id, name: v.patient_name, phone: v.phone }])).values(),
  ];
  const sum = (key: 'total_amount' | 'paid_amount' | 'balance_due') =>
    Math.round(rows.reduce((acc, v) => acc + v[key], 0) * 100) / 100;

  // A name typed slightly differently matches nothing exactly; offer close patient records to pick from.
  let suggestions: { id: number; name: string; phone: string | null; visits: number }[] = [];
  if (rows.length === 0 && q.patient_name && !q.phone_no) {
    const s = await query<{ id: number; name: string; phone: string | null; visits: string }>(
      `SELECT p.id, p.name, p.phone, COUNT(r.id) AS visits
       FROM patients p JOIN requisitions r ON r.patient_id = p.id
       WHERE p.name ILIKE $1
       GROUP BY p.id
       ORDER BY COUNT(r.id) DESC, p.name
       LIMIT 10`,
      [`%${q.patient_name.replace(/[\\%_]/g, '\\$&')}%`],
    );
    suggestions = s.rows.map((r) => ({ ...r, visits: Number(r.visits) }));
  }

  res.json({
    success: true,
    data: {
      patients,
      total_visits: rows.length,
      lifetime_billed: sum('total_amount'),
      lifetime_paid: sum('paid_amount'),
      lifetime_balance_due: sum('balance_due'),
      visits: rows,
      suggestions,
    },
  });
}

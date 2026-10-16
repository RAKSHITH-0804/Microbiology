import { Request, Response } from 'express';
import { query } from '../../config/db';
import { writeAuditLog } from '../../utils/audit';
import { paise, sumPaise } from '../../utils/money';
import { PAYMENT_MODES } from '../requisitions/payment';
import { LogExportInput, PatientLedgerQuery, PaymentHistoryQuery, PaymentSummaryQuery } from './payment.schema';

/**
 * Billing is recorded on the requisition itself (there is no per-instalment ledger), so
 * every figure here is attributed to the date the requisition was registered (created_at).
 */
/** Hospital-credit bills are owed by the hospital and exempt bills are waived, so neither is a patient due. */
const BALANCE_DUE = `CASE WHEN r.payment_status IN ('EXEMPT', 'HOSPITAL_CREDIT') THEN 0 ELSE r.total_amount - r.paid_amount END`;

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
      (p) => `(r.lab_no ILIKE ${p} OR p.name ILIKE ${p} OR p.phone ILIKE ${p} OR r.exempt_referred_by ILIKE ${p})`,
      `%${q.search.replace(/[\\%_]/g, '\\$&')}%`,
    );
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

interface SummaryRow {
  today_collection_paise: number;
  today_count: string;
  filtered_collection_paise: number;
  filtered_billed_paise: number;
  total_outstanding_paise: number;
  hospital_credit_total_paise: number;
  hospital_credit_count: string;
  exempt_total_paise: number;
  exempt_count: string;
  transactions: string;
}

/** Sum of a rupee expression as integer paise, optionally over a subset of rows. */
const sumPaiseWhere = (expr: string, filter: string) =>
  `COALESCE(SUM(${expr} * 100) FILTER (WHERE ${filter}), 0)::int8`;

export async function getPaymentSummary(req: Request, res: Response) {
  const q = req.query as unknown as PaymentSummaryQuery;
  const { where, params } = buildFilters(q);
  const from = `FROM requisitions r JOIN patients p ON p.id = r.patient_id ${where}`;

  const [totals, modes] = await Promise.all([
    query<SummaryRow>(
      `SELECT
         (SELECT ${sumPaise('paid_amount')} FROM requisitions
           WHERE created_at >= date_trunc('day', NOW())) AS today_collection_paise,
         (SELECT COUNT(*) FROM requisitions WHERE created_at >= date_trunc('day', NOW())) AS today_count,
         ${sumPaise('r.paid_amount')} AS filtered_collection_paise,
         ${sumPaise('r.total_amount')} AS filtered_billed_paise,
         ${sumPaise(`(${BALANCE_DUE})`)} AS total_outstanding_paise,
         ${sumPaiseWhere('r.total_amount', "r.payment_status = 'HOSPITAL_CREDIT'")} AS hospital_credit_total_paise,
         COUNT(*) FILTER (WHERE r.payment_status = 'HOSPITAL_CREDIT') AS hospital_credit_count,
         ${sumPaiseWhere('r.total_amount', "r.payment_status = 'EXEMPT'")} AS exempt_total_paise,
         COUNT(*) FILTER (WHERE r.payment_status = 'EXEMPT') AS exempt_count,
         COUNT(*) AS transactions
       ${from}`,
      params,
    ),
    query<{ mode: string | null; count: string; billed_paise: number; collected_paise: number; balance_due_paise: number }>(
      `SELECT r.payment_mode AS mode, COUNT(*) AS count,
              ${sumPaise('r.total_amount')} AS billed_paise,
              ${sumPaise('r.paid_amount')} AS collected_paise,
              ${sumPaise(`(${BALANCE_DUE})`)} AS balance_due_paise
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
      billed_paise: m?.billed_paise ?? 0,
      collected_paise: m?.collected_paise ?? 0,
      balance_due_paise: m?.balance_due_paise ?? 0,
    };
  };

  res.json({
    success: true,
    data: {
      today_collection_paise: t.today_collection_paise,
      today_count: Number(t.today_count),
      filtered_collection_paise: t.filtered_collection_paise,
      filtered_billed_paise: t.filtered_billed_paise,
      total_outstanding_paise: t.total_outstanding_paise,
      hospital_credit_total_paise: t.hospital_credit_total_paise,
      hospital_credit_count: Number(t.hospital_credit_count),
      exempt_total_paise: t.exempt_total_paise,
      exempt_count: Number(t.exempt_count),
      transactions: Number(t.transactions),
      breakdown_by_mode: [...PAYMENT_MODES.map(toBreakdown), toBreakdown(null)],
    },
  });
}

const TRANSACTION_COLUMNS = `
  r.id, r.lab_no, r.receipt_no, r.created_at, r.sample_received_datetime, r.status, r.cancelled_at,
  p.id AS patient_id, p.name AS patient_name, p.phone, r.sample_nature,
  COALESCE(
    (SELECT string_agg(t.test_name, ', ' ORDER BY t.id)
     FROM requisition_tests t WHERE t.requisition_id = r.id),
    ''
  ) AS investigations,
  ${paise('r.total_amount')} AS total_amount_paise, ${paise('r.paid_amount')} AS paid_amount_paise,
  ${paise(`(${BALANCE_DUE})`)} AS balance_due_paise, r.payment_mode, r.payment_status, r.exempt_referred_by,
  (r.status = 'VERIFIED'
    OR EXISTS (SELECT 1 FROM general_reports g WHERE g.requisition_id = r.id AND g.is_verified)
    OR EXISTS (SELECT 1 FROM antibiogram_reports a WHERE a.requisition_id = r.id AND a.is_verified)) AS is_verified`;

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

/** Exports are built in the browser, so the page reports each one here for the audit trail. */
export async function logRevenueExport(req: Request, res: Response) {
  const input = req.body as LogExportInput;
  await writeAuditLog({
    userId: req.user!.sub,
    action: 'REVENUE_EXPORT',
    entityName: 'payments',
    details: {
      format: input.exportFormat,
      rows_exported: input.rowCount,
      total_matching: input.totalMatching,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      payment_mode: input.paymentMode ?? null,
      payment_status: input.paymentStatus ?? null,
      search: input.search || null,
      ip: req.ip,
    },
  });
  res.status(201).json({ success: true, message: 'Export recorded' });
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
    total_amount_paise: number;
    paid_amount_paise: number;
    balance_due_paise: number;
  }>(
    `SELECT ${TRANSACTION_COLUMNS}
     FROM requisitions r JOIN patients p ON p.id = r.patient_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY r.created_at ASC, r.id ASC`,
    params,
  );

  const rows = visits.rows;
  const patients = [
    ...new Map(rows.map((v) => [v.patient_id, { id: v.patient_id, name: v.patient_name, phone: v.phone }])).values(),
  ];
  const sum = (key: 'total_amount_paise' | 'paid_amount_paise' | 'balance_due_paise') =>
    rows.reduce((acc, v) => acc + v[key], 0);

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

  await writeAuditLog({
    userId: req.user!.sub,
    action: 'PATIENT_LEDGER_SEARCH',
    entityName: 'payments',
    details: {
      phone_no: q.phone_no ?? null,
      patient_name: q.patient_name ?? null,
      patients_found: patients.length,
      visits_found: rows.length,
      suggestions_shown: suggestions.length,
      ip: req.ip,
    },
  });

  res.json({
    success: true,
    data: {
      patients,
      total_visits: rows.length,
      lifetime_billed_paise: sum('total_amount_paise'),
      lifetime_paid_paise: sum('paid_amount_paise'),
      lifetime_balance_due_paise: sum('balance_due_paise'),
      visits: rows,
      suggestions,
    },
  });
}

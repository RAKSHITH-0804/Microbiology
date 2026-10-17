import { createHash } from 'crypto';
import { PoolClient } from 'pg';
import { parseAntibiogramData } from './antibiogramData';
import type { ReportType } from './report.schema';

/** Stable JSON stringify with sorted object keys for hashing. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(canonical(payload)).digest('hex');
}

/**
 * Hash of everything that appears on the printed report / clinical header.
 * Used so a review tick is invalid after any of these change.
 */
export async function computeReviewContentVersion(
  client: PoolClient,
  type: ReportType,
  reportId: number,
): Promise<string | null> {
  if (type === 'general') {
    const { rows } = await client.query<{
      specimen: string | null;
      investigation_done: string | null;
      report_findings: string | null;
      prepared_by: number | null;
      reported_by: number | null;
      sample_nature: string | null;
      site_of_collection: string | null;
      patient_name: string;
      age_years: number | null;
      age_months: number | null;
      age_days: number | null;
      sex: string;
      tests: string[] | null;
    }>(
      `SELECT g.specimen, g.investigation_done, g.report_findings, g.prepared_by, g.reported_by,
              r.sample_nature, r.site_of_collection,
              p.name AS patient_name, p.age_years, p.age_months, p.age_days, p.sex,
              (SELECT array_agg(rt.test_name ORDER BY rt.test_name)
               FROM requisition_tests rt WHERE rt.requisition_id = r.id) AS tests
       FROM general_reports g
       JOIN requisitions r ON r.id = g.requisition_id
       JOIN patients p ON p.id = r.patient_id
       WHERE g.id = $1`,
      [reportId],
    );
    const row = rows[0];
    if (!row) return null;
    return hashPayload({
      type: 'general',
      specimen: row.specimen,
      investigation_done: row.investigation_done,
      report_findings: row.report_findings,
      prepared_by: row.prepared_by,
      reported_by: row.reported_by,
      sample_nature: row.sample_nature,
      site_of_collection: row.site_of_collection,
      patient_name: row.patient_name,
      age_years: row.age_years,
      age_months: row.age_months,
      age_days: row.age_days,
      sex: row.sex,
      tests: row.tests ?? [],
    });
  }

  const { rows } = await client.query<{
    organism_isolated: string | null;
    grams_stain_remark: string | null;
    antibiogram_data: unknown;
    prepared_by: number | null;
    reported_by: number | null;
    sample_nature: string | null;
    site_of_collection: string | null;
    patient_name: string;
    age_years: number | null;
    age_months: number | null;
    age_days: number | null;
    sex: string;
    tests: string[] | null;
  }>(
    `SELECT a.organism_isolated, a.grams_stain_remark, a.antibiogram_data, a.prepared_by, a.reported_by,
            r.sample_nature, r.site_of_collection,
            p.name AS patient_name, p.age_years, p.age_months, p.age_days, p.sex,
            (SELECT array_agg(rt.test_name ORDER BY rt.test_name)
             FROM requisition_tests rt WHERE rt.requisition_id = r.id) AS tests
     FROM antibiogram_reports a
     JOIN requisitions r ON r.id = a.requisition_id
     JOIN patients p ON p.id = r.patient_id
     WHERE a.id = $1`,
    [reportId],
  );
  const row = rows[0];
  if (!row) return null;
  const data = parseAntibiogramData(row.antibiogram_data, {
    organism_isolated: row.organism_isolated,
  });
  const organisms = data.organisms
    .map((o) => ({
      organism_name: o.organism_name,
      results: [...o.results]
        .map((r) => ({ antibiotic_name: r.antibiotic_name, sensitivity_result: r.sensitivity_result }))
        .sort((a, b) => a.antibiotic_name.localeCompare(b.antibiotic_name)),
    }))
    .sort((a, b) => a.organism_name.localeCompare(b.organism_name));

  return hashPayload({
    type: 'antibiogram',
    organism_isolated: row.organism_isolated,
    grams_stain_remark: row.grams_stain_remark,
    culture_status: data.culture_status,
    culture_text: data.culture_text,
    organisms,
    prepared_by: row.prepared_by,
    reported_by: row.reported_by,
    sample_nature: row.sample_nature,
    site_of_collection: row.site_of_collection,
    patient_name: row.patient_name,
    age_years: row.age_years,
    age_months: row.age_months,
    age_days: row.age_days,
    sex: row.sex,
    tests: row.tests ?? [],
  });
}

export async function clearReviewMarksForReport(client: PoolClient, type: ReportType, reportId: number) {
  await client.query(`DELETE FROM report_review_marks WHERE report_type = $1 AND report_id = $2`, [type, reportId]);
}

export async function clearReviewMarksForRequisition(client: PoolClient, requisitionId: number) {
  await client.query(
    `DELETE FROM report_review_marks m
     WHERE (m.report_type = 'general' AND m.report_id IN (SELECT id FROM general_reports WHERE requisition_id = $1))
        OR (m.report_type = 'antibiogram' AND m.report_id IN (SELECT id FROM antibiogram_reports WHERE requisition_id = $1))`,
    [requisitionId],
  );
}
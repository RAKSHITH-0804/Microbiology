import { Request, Response } from 'express';
import { query } from '../../config/db';

interface TestCategoryRow {
  category: string;
  tests: { id: number; test_name: string; template_test_name: string | null; has_template: boolean }[];
}

export async function listStaff(_req: Request, res: Response) {
  const { rows } = await query(
    `SELECT id, name, designation, staff_type,
            CASE
              WHEN staff_type = 'TEACHING' THEN 'DOCTOR'
              WHEN designation ILIKE '%lab%tech%' THEN 'LAB_TECH'
              ELSE 'OTHER'
            END AS staff_role
     FROM master_staff
     WHERE is_active
     ORDER BY id`,
  );
  res.json({ success: true, data: rows });
}

/** Preset finding phrases grouped by template test name. */
export async function listFindingTemplates(_req: Request, res: Response) {
  const { rows } = await query(
    `SELECT test_name,
            json_agg(json_build_object('id', id, 'finding_text', finding_text) ORDER BY id) AS findings
     FROM master_test_templates
     WHERE is_active
     GROUP BY test_name
     ORDER BY test_name`,
  );
  res.json({ success: true, data: rows });
}

export async function listTestCatalog(_req: Request, res: Response) {
  const { rows } = await query<TestCategoryRow>(
    `SELECT c.category,
            json_agg(
              json_build_object(
                'id', c.id,
                'test_name', c.test_name,
                'template_test_name', c.template_test_name,
                'has_template', EXISTS (
                  SELECT 1 FROM master_test_templates t
                  WHERE t.test_name = c.template_test_name AND t.is_active
                )
              ) ORDER BY c.sort_order, c.id
            ) AS tests
     FROM master_test_catalog c
     WHERE c.is_active
     GROUP BY c.category
     ORDER BY MIN(c.sort_order)`,
  );
  res.json({ success: true, data: rows });
}

-- Multi-organism antibiogram data (JSONB) plus per-organism sensitivity rows.
-- Legacy single-organism reports are backfilled into antibiogram_data for seamless reads.

ALTER TABLE antibiogram_reports
  ADD COLUMN IF NOT EXISTS antibiogram_data JSONB;

ALTER TABLE antibiogram_reports
  ALTER COLUMN organism_isolated TYPE VARCHAR(500);

ALTER TABLE antibiogram_results
  ADD COLUMN IF NOT EXISTS organism_name VARCHAR(200);

-- Existing rows belong to the report's single organism_isolated value.
UPDATE antibiogram_results x
SET organism_name = COALESCE(
  (SELECT NULLIF(TRIM(a.organism_isolated), '') FROM antibiogram_reports a WHERE a.id = x.antibiogram_report_id),
  'Organism'
)
WHERE x.organism_name IS NULL;

ALTER TABLE antibiogram_results
  ALTER COLUMN organism_name SET NOT NULL;

ALTER TABLE antibiogram_results
  DROP CONSTRAINT IF EXISTS uq_antibiogram_result;

ALTER TABLE antibiogram_results
  ADD CONSTRAINT uq_antibiogram_result UNIQUE (antibiogram_report_id, organism_name, antibiotic_name);

-- Backfill antibiogram_data from legacy columns + results.
UPDATE antibiogram_reports a
SET antibiogram_data = jsonb_build_object(
  'culture_status', 'GROWTH',
  'culture_text', NULL,
  'organisms', jsonb_build_array(
    jsonb_build_object(
      'organism_name', COALESCE(NULLIF(TRIM(a.organism_isolated), ''), 'Organism'),
      'results', COALESCE(
        (
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'antibiotic_name', x.antibiotic_name,
                     'sensitivity_result', x.sensitivity_result
                   )
                   ORDER BY x.id
                 )
          FROM antibiogram_results x
          WHERE x.antibiogram_report_id = a.id
        ),
        '[]'::jsonb
      )
    )
  )
)
WHERE a.antibiogram_data IS NULL;

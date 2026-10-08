-- Age as written on the requisition form: "__ Years __ Months __ Days".
-- age_value / age_unit remain as the single-unit summary used for display and sorting.
ALTER TABLE patients
  ADD COLUMN age_years  SMALLINT CHECK (age_years  IS NULL OR age_years  BETWEEN 0 AND 150),
  ADD COLUMN age_months SMALLINT CHECK (age_months IS NULL OR age_months BETWEEN 0 AND 11),
  ADD COLUMN age_days   SMALLINT CHECK (age_days   IS NULL OR age_days   BETWEEN 0 AND 30);

UPDATE patients SET
  age_years  = CASE age_unit WHEN 'Y' THEN age_value WHEN 'M' THEN age_value / 12 ELSE age_value / 365 END,
  age_months = CASE age_unit WHEN 'Y' THEN 0 WHEN 'M' THEN age_value % 12 ELSE LEAST((age_value % 365) / 30, 11) END,
  age_days   = CASE age_unit WHEN 'D' THEN LEAST((age_value % 365) % 30, 30) ELSE 0 END
WHERE age_value IS NOT NULL;

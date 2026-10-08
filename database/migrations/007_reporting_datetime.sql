-- Reports show the time of reporting, not just the date. Existing rows take
-- their last-saved time; every save sets it to NOW().
ALTER TABLE general_reports
  ALTER COLUMN reporting_date TYPE TIMESTAMPTZ USING updated_at,
  ALTER COLUMN reporting_date SET DEFAULT NOW();
ALTER TABLE general_reports RENAME COLUMN reporting_date TO reporting_datetime;

ALTER TABLE antibiogram_reports
  ALTER COLUMN reporting_date TYPE TIMESTAMPTZ USING updated_at,
  ALTER COLUMN reporting_date SET DEFAULT NOW();
ALTER TABLE antibiogram_reports RENAME COLUMN reporting_date TO reporting_datetime;

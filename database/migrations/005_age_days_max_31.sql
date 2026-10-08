ALTER TABLE patients DROP CONSTRAINT patients_age_days_check;
ALTER TABLE patients ADD CONSTRAINT patients_age_days_check CHECK (age_days IS NULL OR age_days BETWEEN 0 AND 31);

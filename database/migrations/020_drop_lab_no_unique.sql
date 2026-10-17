-- Lab numbers are shared daily counters; remove uniqueness enforced by 019.
ALTER TABLE requisitions DROP CONSTRAINT IF EXISTS requisitions_lab_no_key;
DROP INDEX IF EXISTS idx_requisitions_lab_no;
DROP INDEX IF EXISTS idx_requisitions_lab_no_unique;
DROP INDEX IF EXISTS requisitions_lab_no_unique;

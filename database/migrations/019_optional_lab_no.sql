-- Lab No is assigned when the sample arrives; registration only requires Receipt No.
-- Lab numbers are daily shared counters in the lab — not globally unique keys.
ALTER TABLE requisitions
  ALTER COLUMN lab_no DROP NOT NULL;

ALTER TABLE requisitions DROP CONSTRAINT IF EXISTS requisitions_lab_no_key;
DROP INDEX IF EXISTS idx_requisitions_lab_no;
DROP INDEX IF EXISTS idx_requisitions_lab_no_unique;
DROP INDEX IF EXISTS requisitions_lab_no_unique;

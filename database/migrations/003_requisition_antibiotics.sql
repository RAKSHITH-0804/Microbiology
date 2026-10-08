-- =====================================================================
-- 003_requisition_antibiotics.sql
-- "Antibiotics Used" and "Preferred Antibiotics to be tested" from the
-- paper requisition form.
-- =====================================================================

ALTER TABLE requisitions
  ADD COLUMN preferred_antibiotics TEXT,
  ADD COLUMN antibiotics_used      TEXT;

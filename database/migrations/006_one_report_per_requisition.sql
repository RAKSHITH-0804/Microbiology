-- Each requisition has at most one general report and one antibiogram report;
-- saving again updates the existing row (INSERT ... ON CONFLICT).
DROP INDEX IF EXISTS idx_general_reports_requisition;
DROP INDEX IF EXISTS idx_antibiogram_reports_requisition;

CREATE UNIQUE INDEX uq_general_reports_requisition     ON general_reports (requisition_id);
CREATE UNIQUE INDEX uq_antibiogram_reports_requisition ON antibiogram_reports (requisition_id);

-- =====================================================================
-- 002_test_catalog.sql
-- Orderable investigations shown on the requisition form, grouped by
-- section. template_test_name links a test to master_test_templates
-- (report findings) where one exists.
-- =====================================================================

CREATE TABLE master_test_catalog (
  id                   SERIAL PRIMARY KEY,
  category             VARCHAR(100) NOT NULL,
  test_name            VARCHAR(200) NOT NULL,
  template_test_name   VARCHAR(200),
  sort_order           SMALLINT     NOT NULL DEFAULT 0,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_master_test_catalog UNIQUE (category, test_name)
);

CREATE TRIGGER trg_master_test_catalog_updated_at BEFORE UPDATE ON master_test_catalog
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_requisition_tests_name ON requisition_tests (test_name);

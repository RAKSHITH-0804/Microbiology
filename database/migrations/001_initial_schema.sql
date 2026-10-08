-- =====================================================================
-- J.J.M. Medical College - Department of Microbiology
-- 001_initial_schema.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------
CREATE TYPE staff_type          AS ENUM ('TEACHING', 'NON_TEACHING');
CREATE TYPE user_role           AS ENUM ('HOD', 'DOCTOR', 'LAB_TECH');
CREATE TYPE age_unit            AS ENUM ('Y', 'M', 'D');
CREATE TYPE sex_type            AS ENUM ('M', 'F', 'Other');
CREATE TYPE requisition_status  AS ENUM ('RECEIVED', 'REPORT_ENTERED', 'VERIFIED');
CREATE TYPE sensitivity_result  AS ENUM ('S', 'R', 'MS');

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Master tables
-- ---------------------------------------------------------------------
CREATE TABLE master_staff (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  designation   VARCHAR(150) NOT NULL,
  staff_type    staff_type   NOT NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_master_staff_name_designation UNIQUE (name, designation)
);

CREATE TABLE master_samples (
  id            SERIAL PRIMARY KEY,
  sample_name   VARCHAR(150) NOT NULL UNIQUE,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE master_organisms (
  id              SERIAL PRIMARY KEY,
  category        VARCHAR(100) NOT NULL,
  organism_name   VARCHAR(200) NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_master_organisms_category_name UNIQUE (category, organism_name)
);

CREATE TABLE master_antibiotics (
  id                SERIAL PRIMARY KEY,
  antibiotic_name   VARCHAR(150) NOT NULL UNIQUE,
  short_code        VARCHAR(20),
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE master_test_templates (
  id              SERIAL PRIMARY KEY,
  test_name       VARCHAR(200) NOT NULL,
  finding_text    TEXT         NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_master_test_templates UNIQUE (test_name, finding_text)
);

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  username        VARCHAR(50)  NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            user_role    NOT NULL,
  staff_id        INTEGER      REFERENCES master_staff(id) ON DELETE SET NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_users_username_lower ON users (LOWER(username));

-- ---------------------------------------------------------------------
-- Patients & requisitions
-- ---------------------------------------------------------------------
CREATE TABLE patients (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  age_value   SMALLINT     CHECK (age_value IS NULL OR age_value BETWEEN 0 AND 150),
  age_unit    age_unit     NOT NULL DEFAULT 'Y',
  sex         sex_type,
  phone       VARCHAR(20),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_patients_phone ON patients (phone);
CREATE INDEX idx_patients_name  ON patients (LOWER(name));

CREATE TABLE requisitions (
  id                            SERIAL PRIMARY KEY,
  lab_no                        VARCHAR(50)  NOT NULL UNIQUE,
  receipt_no                    VARCHAR(50),
  patient_id                    INTEGER      NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  hospital                      VARCHAR(150),
  consultant_doctor             VARCHAR(150),
  op_ip_no                      VARCHAR(50),
  ward_unit                     VARCHAR(100),
  clinical_diagnosis            TEXT,
  sample_nature                 VARCHAR(150),
  site_of_collection            VARCHAR(150),
  sample_collection_datetime    TIMESTAMPTZ,
  sample_received_datetime      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  status                        requisition_status NOT NULL DEFAULT 'RECEIVED',
  created_by                    INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at                    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_requisitions_status       ON requisitions (status);
CREATE INDEX idx_requisitions_patient      ON requisitions (patient_id);
CREATE INDEX idx_requisitions_received_at  ON requisitions (sample_received_datetime DESC);
CREATE INDEX idx_requisitions_op_ip_no     ON requisitions (op_ip_no);

CREATE TABLE requisition_tests (
  id               SERIAL PRIMARY KEY,
  requisition_id   INTEGER      NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  test_category    VARCHAR(100) NOT NULL,
  test_name        VARCHAR(200) NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_requisition_tests_requisition ON requisition_tests (requisition_id);

-- ---------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------
CREATE TABLE general_reports (
  id                   SERIAL PRIMARY KEY,
  requisition_id       INTEGER     NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  reporting_date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  specimen             VARCHAR(150),
  investigation_done   VARCHAR(255),
  report_findings      TEXT,
  prepared_by          INTEGER     REFERENCES master_staff(id) ON DELETE SET NULL,
  reported_by          INTEGER     REFERENCES master_staff(id) ON DELETE SET NULL,
  is_verified          BOOLEAN     NOT NULL DEFAULT FALSE,
  verified_by          INTEGER     REFERENCES master_staff(id) ON DELETE SET NULL,
  verified_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_general_reports_requisition ON general_reports (requisition_id);

CREATE TABLE antibiogram_reports (
  id                   SERIAL PRIMARY KEY,
  requisition_id       INTEGER     NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  reporting_date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  organism_isolated    VARCHAR(200),
  grams_stain_remark   TEXT,
  prepared_by          INTEGER     REFERENCES master_staff(id) ON DELETE SET NULL,
  reported_by          INTEGER     REFERENCES master_staff(id) ON DELETE SET NULL,
  is_verified          BOOLEAN     NOT NULL DEFAULT FALSE,
  verified_by          INTEGER     REFERENCES master_staff(id) ON DELETE SET NULL,
  verified_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_antibiogram_reports_requisition ON antibiogram_reports (requisition_id);

CREATE TABLE antibiogram_results (
  id                       SERIAL PRIMARY KEY,
  antibiogram_report_id    INTEGER            NOT NULL REFERENCES antibiogram_reports(id) ON DELETE CASCADE,
  antibiotic_name          VARCHAR(150)       NOT NULL,
  sensitivity_result       sensitivity_result NOT NULL,
  CONSTRAINT uq_antibiogram_result UNIQUE (antibiogram_report_id, antibiotic_name)
);

-- ---------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  action        VARCHAR(50)  NOT NULL,
  entity_name   VARCHAR(100) NOT NULL,
  entity_id     INTEGER,
  details       JSONB,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_entity  ON audit_logs (entity_name, entity_id);
CREATE INDEX idx_audit_logs_user    ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'master_staff', 'master_samples', 'master_organisms', 'master_antibiotics',
    'master_test_templates', 'users', 'patients', 'requisitions',
    'general_reports', 'antibiogram_reports'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END;
$$;

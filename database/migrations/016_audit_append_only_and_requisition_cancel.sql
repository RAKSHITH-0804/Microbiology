-- Tamper-proof audit trail, and cancelling a requisition without deleting it (deletes cascade to reports).

-- ---------------------------------------------------------------------
-- audit_logs: who acted, kept even after the account is deleted
-- ---------------------------------------------------------------------
ALTER TABLE audit_logs ADD COLUMN username VARCHAR(50);

UPDATE audit_logs a SET username = u.username FROM users u WHERE u.id = a.user_id;

-- ---------------------------------------------------------------------
-- audit_logs: append-only
-- Rows can never be deleted, truncated or rewritten. The one permitted update is the
-- ON DELETE SET NULL of user_id when an account is deleted; username preserves who it was.
-- DROP TABLE / DROP SCHEMA (db:reset in development) fire no row triggers and still work.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS NOT NULL
       AND NEW.user_id IS NULL
       AND (NEW.id, NEW.action, NEW.entity_name, NEW.entity_id, NEW.details, NEW.created_at, NEW.username)
           IS NOT DISTINCT FROM
           (OLD.id, OLD.action, OLD.entity_name, OLD.entity_id, OLD.details, OLD.created_at, OLD.username)
    THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

CREATE TRIGGER trg_audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only();

-- ---------------------------------------------------------------------
-- requisitions: cancellation
-- ---------------------------------------------------------------------
ALTER TABLE requisitions
  ADD COLUMN cancelled_at  TIMESTAMPTZ,
  ADD COLUMN cancelled_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN cancel_reason TEXT,
  ADD CONSTRAINT chk_requisitions_cancel
    CHECK ((cancelled_at IS NULL) = (cancel_reason IS NULL));

CREATE INDEX idx_requisitions_active ON requisitions (sample_received_datetime DESC) WHERE cancelled_at IS NULL;

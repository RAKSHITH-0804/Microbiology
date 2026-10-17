-- Per-doctor "Reviewed - correct" ticks for bulk verification. content_version is a hash of
-- printed/clinical fields at tick time; bulk verify rejects the mark if the hash no longer matches.
CREATE TABLE report_review_marks (
  user_id         INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_type     VARCHAR(20)  NOT NULL CHECK (report_type IN ('general', 'antibiogram')),
  report_id       INTEGER      NOT NULL,
  content_version VARCHAR(64)  NOT NULL,
  checked_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, report_type, report_id)
);

CREATE INDEX idx_report_review_marks_user ON report_review_marks (user_id);
CREATE INDEX idx_report_review_marks_report ON report_review_marks (report_type, report_id);

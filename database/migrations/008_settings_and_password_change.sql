-- Department-wide configuration (letterhead, lab number prefix, print defaults),
-- one JSON value per key. Defaults match the values previously hard-coded.
CREATE TABLE system_settings (
  key          VARCHAR(100) PRIMARY KEY,
  value        JSONB        NOT NULL,
  updated_by   INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value) VALUES
  ('letterhead_line1', '"Bapuji Educational Association ®"'),
  ('letterhead_line2', '"DEPARTMENT OF MICROBIOLOGY"'),
  ('letterhead_line3', '"J.J.M. MEDICAL COLLEGE, DAVANGERE – 4"'),
  ('lab_no_prefix',    '"LAB-YYYY-"'),
  ('print_defaults',   '{"auto_print_after_save": false, "show_end_of_report": true}')
ON CONFLICT (key) DO NOTHING;

-- Sessions issued before the last password change are rejected.
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ;

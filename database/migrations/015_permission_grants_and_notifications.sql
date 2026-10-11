-- user_permissions rows now override a role's default modules in both directions: is_enabled = FALSE
-- switches a default module off, is_enabled = TRUE grants a module the role does not have by default.
-- Existing rows only ever covered default modules, so their meaning is unchanged.
COMMENT ON TABLE user_permissions IS
  'Per-user overrides of the role''s default modules: FALSE revokes a default module, TRUE grants an extra one.';

-- In-app notifications, one row per recipient so each user keeps their own read state.
CREATE TABLE notifications (
  id            SERIAL        PRIMARY KEY,
  recipient_id  INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          VARCHAR(20)   NOT NULL,
  title         VARCHAR(150)  NOT NULL,
  message       TEXT          NOT NULL,
  link          VARCHAR(255),
  entity_name   VARCHAR(50),
  entity_id     INTEGER,
  is_read       BOOLEAN       NOT NULL DEFAULT FALSE,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_notifications_type CHECK (type IN ('PASSWORD_RESET', 'SYSTEM_UPDATE', 'ALERT', 'GENERAL'))
);

CREATE INDEX idx_notifications_recipient ON notifications (recipient_id, created_at DESC);
CREATE INDEX idx_notifications_open_entity ON notifications (entity_name, entity_id) WHERE NOT is_read;

-- Reset requests still waiting for a temporary password become notifications for every active Super Admin.
INSERT INTO notifications (recipient_id, type, title, message, link, entity_name, entity_id, created_at)
SELECT a.id,
       'PASSWORD_RESET',
       'Password reset requested',
       COALESCE(s.name || ' (' || u.username || ')', u.username) || ' asked for a password reset.',
       '/users',
       'users',
       u.id,
       COALESCE(u.password_reset_requested_at, NOW())
FROM users u
LEFT JOIN master_staff s ON s.id = u.staff_id
CROSS JOIN users a
WHERE u.password_reset_requested AND u.is_active
  AND a.role = 'SUPER_ADMIN' AND a.is_active;

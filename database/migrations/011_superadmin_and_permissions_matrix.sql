-- Super Admin role and per-user module permissions.
--
-- Roles move from the user_role enum to text guarded by a CHECK constraint: a value added to
-- an enum cannot be used inside the transaction that adds it, and this migration seeds a
-- SUPER_ADMIN account in the same transaction. A CHECK is also simpler to extend later.

ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20) USING role::text;
DROP TYPE user_role;
ALTER TABLE users
  ADD CONSTRAINT chk_users_role CHECK (role IN ('SUPER_ADMIN', 'HOD', 'DOCTOR', 'LAB_TECH'));

CREATE TABLE user_permissions (
  id          SERIAL       PRIMARY KEY,
  user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_key  VARCHAR(50)  NOT NULL,
  is_enabled  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_permissions_user_module UNIQUE (user_id, module_key),
  CONSTRAINT chk_user_permissions_module CHECK (module_key IN (
    'new_requisition', 'pending_worklist', 'requisitions', 'reports', 'verification',
    'billing', 'master_data', 'users', 'audit_logs'
  ))
);

-- The "superadmin" account is created by the seeder from SUPERADMIN_DEFAULT_PASSWORD; no credentials live in SQL.

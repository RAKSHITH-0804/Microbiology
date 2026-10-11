-- Forgot-password requests and the compulsory first-login change for HOD.
-- The Super Admin password is applied by the seeder from SUPERADMIN_DEFAULT_PASSWORD; no credentials live in SQL.

-- Set from the login page's "Forgot Password?"; cleared when the Super Admin issues a temporary password.
ALTER TABLE users
  ADD COLUMN password_reset_requested    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN password_reset_requested_at TIMESTAMPTZ;

-- 009 exempted HOD accounts from the first-login change. HODs still on their initial password must now replace it.
UPDATE users SET must_change_password = TRUE WHERE role = 'HOD' AND password_changed_at IS NULL;

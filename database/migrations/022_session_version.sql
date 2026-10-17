-- Invalidate JWTs after password change/reset without relying on whole-second iat comparisons.
ALTER TABLE users
  ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;

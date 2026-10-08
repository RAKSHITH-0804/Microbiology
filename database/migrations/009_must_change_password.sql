-- New and seeded accounts start with a temporary password that must be replaced at first sign-in.
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT TRUE;

-- The HOD, and anyone who has already chosen their own password, are not asked again.
UPDATE users SET must_change_password = FALSE WHERE role = 'HOD' OR password_changed_at IS NOT NULL;

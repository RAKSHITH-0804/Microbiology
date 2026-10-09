-- Clerk role (front-desk registration) and the authority behind fee exemptions.

ALTER TABLE users DROP CONSTRAINT chk_users_role;
ALTER TABLE users
  ADD CONSTRAINT chk_users_role CHECK (role IN ('SUPER_ADMIN', 'HOD', 'DOCTOR', 'LAB_TECH', 'CLERK'));

-- Who referred or authorised a hospital-credit / exempt requisition (e.g. "Dr. X, Medical Superintendent").
-- Required by the application for HOSPITAL_CREDIT bills; older rows have no value.
ALTER TABLE requisitions ADD COLUMN exempt_referred_by VARCHAR(255);

-- Clerks are recorded in master_staff as NON_TEACHING staff, alongside lab technicians.
COMMENT ON TYPE staff_type IS
  'TEACHING: doctors and faculty. NON_TEACHING: lab technicians, clerks and other support staff.';

-- Hospital credit and fee exemption become separate payment modes, each with its own status:
--   HOSPITAL_CREDIT: the bill is raised against the hospital (status HOSPITAL_CREDIT).
--   EXEMPT:          the fee is waived on someone's authority (status EXEMPT, exempt_referred_by required).
-- Both release the sample to the Pending Worklist without a counter payment.

ALTER TABLE requisitions
  DROP CONSTRAINT requisitions_payment_mode_check,
  DROP CONSTRAINT requisitions_payment_status_check;

-- Until now HOSPITAL_CREDIT was recorded as an exemption (status EXEMPT), so it keeps that meaning.
UPDATE requisitions SET payment_mode = 'EXEMPT' WHERE payment_mode = 'HOSPITAL_CREDIT';

ALTER TABLE requisitions
  ADD CONSTRAINT requisitions_payment_mode_check
    CHECK (payment_mode IS NULL OR payment_mode IN ('CASH', 'CARD', 'UPI', 'HOSPITAL_CREDIT', 'EXEMPT')),
  ADD CONSTRAINT requisitions_payment_status_check
    CHECK (payment_status IN ('PAID', 'PARTIAL', 'UNPAID', 'HOSPITAL_CREDIT', 'EXEMPT'));

COMMENT ON COLUMN requisitions.exempt_referred_by IS
  'Who referred or authorised a fee exemption; required when payment_mode is EXEMPT.';

-- Standalone Status Timeline page, switchable per user in the permission matrix.
ALTER TABLE user_permissions DROP CONSTRAINT chk_user_permissions_module;
ALTER TABLE user_permissions
  ADD CONSTRAINT chk_user_permissions_module CHECK (module_key IN (
    'new_requisition', 'pending_worklist', 'requisitions', 'reports', 'verification',
    'billing', 'status_timeline', 'master_data', 'users', 'audit_logs'
  ));

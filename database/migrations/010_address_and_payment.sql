-- Patient address and billing on each requisition. A requisition reaches the
-- Pending Worklist (report entry) only once it is PAID or EXEMPT.
ALTER TABLE requisitions
  ADD COLUMN address         TEXT,
  ADD COLUMN total_amount    NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  ADD COLUMN paid_amount     NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
  ADD COLUMN payment_status  VARCHAR(20)   NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('PAID', 'PARTIAL', 'UNPAID', 'EXEMPT')),
  ADD COLUMN payment_mode    VARCHAR(50)
    CHECK (payment_mode IS NULL OR payment_mode IN ('CASH', 'UPI', 'CARD', 'HOSPITAL_CREDIT')),
  ADD CONSTRAINT chk_requisitions_paid_not_above_total CHECK (paid_amount <= total_amount);

-- Samples registered before billing existed were already accepted for testing;
-- keep them in the workflow instead of hiding them behind an unknown payment.
UPDATE requisitions SET payment_status = 'EXEMPT';

CREATE INDEX idx_requisitions_payment_status ON requisitions (payment_status);

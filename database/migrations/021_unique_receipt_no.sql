-- Receipt No is the payment bill number; unique ignoring case and surrounding spaces.
CREATE UNIQUE INDEX uq_requisitions_receipt_no_normalized
  ON requisitions (LOWER(TRIM(receipt_no)))
  WHERE receipt_no IS NOT NULL AND TRIM(receipt_no) <> '';

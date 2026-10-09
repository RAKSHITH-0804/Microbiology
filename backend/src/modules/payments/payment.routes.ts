import { Router } from 'express';
import { requireAuth, requireRevenueAccess } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { getPatientLedger, getPaymentHistory, getPaymentSummary } from './payment.controller';
import { patientLedgerQuery, paymentHistoryQuery, paymentSummaryQuery } from './payment.schema';

const router = Router();

router.use(requireAuth, requireRevenueAccess);
router.get('/summary', validate({ query: paymentSummaryQuery }), asyncHandler(getPaymentSummary));
router.get('/history', validate({ query: paymentHistoryQuery }), asyncHandler(getPaymentHistory));
router.get('/patient-ledger', validate({ query: patientLedgerQuery }), asyncHandler(getPatientLedger));

export default router;

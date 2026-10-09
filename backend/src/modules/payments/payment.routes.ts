import { Router } from 'express';
import { requireAuth, requireModule, requireRevenueAccess } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { getPatientLedger, getPaymentHistory, getPaymentSummary, logRevenueExport } from './payment.controller';
import { logExportSchema, patientLedgerQuery, paymentHistoryQuery, paymentSummaryQuery } from './payment.schema';

const router = Router();

router.use(requireAuth, requireRevenueAccess, requireModule('billing'));
router.get('/summary', validate({ query: paymentSummaryQuery }), asyncHandler(getPaymentSummary));
router.get('/history', validate({ query: paymentHistoryQuery }), asyncHandler(getPaymentHistory));
router.get('/patient-ledger', validate({ query: patientLedgerQuery }), asyncHandler(getPatientLedger));
router.post('/log-export', validate({ body: logExportSchema }), asyncHandler(logRevenueExport));

export default router;

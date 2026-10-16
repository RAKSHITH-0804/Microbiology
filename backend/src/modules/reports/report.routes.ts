import { Router } from 'express';
import { requireAccess, requireAuth, requireModule, restrictTo } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  listReports,
  listUnverifiedReports,
  logReportPrint,
  revokeVerification,
  saveAntibiogramReport,
  saveGeneralReport,
  verifyReport,
} from './report.controller';
import {
  antibiogramReportSchema,
  generalReportSchema,
  listReportsQuery,
  printLogParams,
  revokeVerificationSchema,
  verifyReportParams,
} from './report.schema';

const router = Router();

router.use(requireAuth);
router.get('/', requireModule('reports'), validate({ query: listReportsQuery }), asyncHandler(listReports));
const verifiers = requireAccess(['DOCTOR', 'HOD'], ['verification'], 'Access denied: Reports are verified by doctors');
router.get('/unverified', verifiers, asyncHandler(listUnverifiedReports));
// Reports are entered from the worklist and corrected during verification.
const reportAuthors = requireAccess(
  ['LAB_TECH', 'DOCTOR', 'HOD'],
  ['pending_worklist', 'verification'],
  'Access denied: Reports are entered by lab technicians and doctors',
);
router.post('/general', reportAuthors, validate({ body: generalReportSchema }), asyncHandler(saveGeneralReport));
router.post('/antibiogram', reportAuthors, validate({ body: antibiogramReportSchema }), asyncHandler(saveAntibiogramReport));
router.post(
  '/:type/:id/verify',
  verifiers,
  validate({ params: verifyReportParams }),
  asyncHandler(verifyReport),
);
router.post(
  '/:type/:id/revoke',
  restrictTo(['HOD'], 'Only the HOD can revoke a verification'),
  validate({ params: verifyReportParams, body: revokeVerificationSchema }),
  asyncHandler(revokeVerification),
);
router.post('/:type/:requisitionId/print-log', validate({ params: printLogParams }), asyncHandler(logReportPrint));

export default router;

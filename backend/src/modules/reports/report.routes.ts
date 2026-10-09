import { Router } from 'express';
import { requireAuth, requireModule, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  listReports,
  listUnverifiedReports,
  saveAntibiogramReport,
  saveGeneralReport,
  verifyReport,
} from './report.controller';
import { antibiogramReportSchema, generalReportSchema, listReportsQuery, verifyReportParams } from './report.schema';

const router = Router();

router.use(requireAuth);
router.get('/', requireModule('reports'), validate({ query: listReportsQuery }), asyncHandler(listReports));
router.get('/unverified', requireRole('DOCTOR', 'HOD'), requireModule('verification'), asyncHandler(listUnverifiedReports));
// Reports are entered from the worklist and corrected during verification.
const reportAuthors = [requireRole('LAB_TECH', 'DOCTOR', 'HOD'), requireModule('pending_worklist', 'verification')];
router.post('/general', ...reportAuthors, validate({ body: generalReportSchema }), asyncHandler(saveGeneralReport));
router.post('/antibiogram', ...reportAuthors, validate({ body: antibiogramReportSchema }), asyncHandler(saveAntibiogramReport));
router.post(
  '/:type/:id/verify',
  requireRole('DOCTOR', 'HOD'),
  requireModule('verification'),
  validate({ params: verifyReportParams }),
  asyncHandler(verifyReport),
);

export default router;

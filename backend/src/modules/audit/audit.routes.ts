import { Router } from 'express';
import { requireAdminModule, requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { auditLogQuery, listAuditLogs } from './audit.controller';

const router = Router();

router.use(requireAuth, requireAdminModule('audit_logs'));
router.get('/', validate({ query: auditLogQuery }), asyncHandler(listAuditLogs));

export default router;

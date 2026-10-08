import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { getDashboardStats } from './dashboard.controller';

const router = Router();

router.use(requireAuth);
router.get('/stats', asyncHandler(getDashboardStats));

export default router;

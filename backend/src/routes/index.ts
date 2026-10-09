import { Router } from 'express';
import { checkDatabaseConnection } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import auditRoutes from '../modules/audit/audit.routes';
import authRoutes from '../modules/auth/auth.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import masterRoutes from '../modules/master/master.routes';
import paymentRoutes from '../modules/payments/payment.routes';
import reportRoutes from '../modules/reports/report.routes';
import requisitionRoutes from '../modules/requisitions/requisition.routes';
import settingsRoutes from '../modules/settings/settings.routes';
import userRoutes from '../modules/users/user.routes';

const router = Router();

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const database = await checkDatabaseConnection();
    res.status(database ? 200 : 503).json({
      success: database,
      data: { api: 'ok', database: database ? 'ok' : 'unreachable', timestamp: new Date().toISOString() },
    });
  }),
);

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/master', masterRoutes);
router.use('/requisitions', requisitionRoutes);
router.use('/reports', reportRoutes);
router.use('/payments', paymentRoutes);
router.use('/users', userRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/settings', settingsRoutes);

export default router;

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationIdParams,
} from './notification.controller';

const router = Router();

router.use(requireAuth);
router.get('/', asyncHandler(listNotifications));
router.patch('/read-all', asyncHandler(markAllNotificationsRead));
router.patch('/:id/read', validate({ params: notificationIdParams }), asyncHandler(markNotificationRead));

export default router;

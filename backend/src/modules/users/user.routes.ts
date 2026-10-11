import { Router } from 'express';
import { requireAdminModule, requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { createUser, deleteUser, listUsers, resetUserPassword, setUserStatus } from './user.controller';
import { createUserSchema, resetPasswordSchema, userIdParams, userStatusSchema } from './user.schema';

const router = Router();

router.use(requireAuth, requireAdminModule('users'));
router.get('/', asyncHandler(listUsers));
router.post('/', validate({ body: createUserSchema }), asyncHandler(createUser));
router.patch('/:id/status', validate({ params: userIdParams, body: userStatusSchema }), asyncHandler(setUserStatus));
router.post(
  '/:id/reset-password',
  validate({ params: userIdParams, body: resetPasswordSchema }),
  asyncHandler(resetUserPassword),
);
router.delete('/:id', validate({ params: userIdParams }), asyncHandler(deleteUser));

export default router;

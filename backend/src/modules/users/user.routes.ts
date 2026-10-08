import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { createUser, listUsers, setUserStatus } from './user.controller';
import { createUserSchema, userIdParams, userStatusSchema } from './user.schema';

const router = Router();

router.use(requireAuth, requireRole('HOD'));
router.get('/', asyncHandler(listUsers));
router.post('/', validate({ body: createUserSchema }), asyncHandler(createUser));
router.patch('/:id/status', validate({ params: userIdParams, body: userStatusSchema }), asyncHandler(setUserStatus));

export default router;

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { changePassword, login, logout, me } from './auth.controller';
import { changePasswordSchema, loginSchema } from './auth.schema';

const router = Router();

router.post('/login', validate({ body: loginSchema }), asyncHandler(login));
router.post('/logout', asyncHandler(logout));
router.get('/me', requireAuth, asyncHandler(me));
router.post('/change-password', requireAuth, validate({ body: changePasswordSchema }), asyncHandler(changePassword));

export default router;

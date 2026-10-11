import { Router } from 'express';
import { requireSession } from '../../middleware/auth';
import { passwordResetLimiter } from '../../middleware/security';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { changePassword, forgotPassword, login, logout, me } from './auth.controller';
import { changePasswordSchema, forgotPasswordSchema, loginSchema } from './auth.schema';

const router = Router();

router.post('/login', validate({ body: loginSchema }), asyncHandler(login));
router.post('/forgot-password', passwordResetLimiter, validate({ body: forgotPasswordSchema }), asyncHandler(forgotPassword));
router.post('/logout', asyncHandler(logout));
router.get('/me', requireSession, asyncHandler(me));
router.post('/change-password', requireSession, validate({ body: changePasswordSchema }), asyncHandler(changePassword));

export default router;

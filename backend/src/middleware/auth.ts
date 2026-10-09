import { NextFunction, Request, Response } from 'express';
import { query } from '../config/db';
import { AppError } from './errorHandler';
import { AUTH_COOKIE, AuthUser, JwtPayload, UserRole, verifyToken } from '../utils/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/** Authenticates the request and blocks accounts that still have to replace their temporary password. */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => authenticate(req, res, next, true);

/** Authenticates without the password-change gate; only for /auth/me and /auth/change-password. */
export const requireSession = (req: Request, res: Response, next: NextFunction) => authenticate(req, res, next, false);

async function authenticate(req: Request, _res: Response, next: NextFunction, enforcePasswordChange: boolean) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : undefined;
  const token: string | undefined = req.cookies?.[AUTH_COOKIE] ?? bearer;

  if (!token) return next(new AppError(401, 'Authentication required'));

  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(new AppError(401, 'Session expired or invalid. Please log in again.'));
  }

  // Re-checked on every request so disabling an account, changing its role or its password applies immediately.
  try {
    const { rows } = await query<{
      role: UserRole;
      staff_id: number | null;
      is_active: boolean;
      password_changed_at: Date | null;
      must_change_password: boolean;
    }>('SELECT role, staff_id, is_active, password_changed_at, must_change_password FROM users WHERE id = $1', [
      payload.sub,
    ]);
    const user = rows[0];
    if (!user?.is_active) return next(new AppError(401, 'Your account is disabled. Contact the HOD.'));
    if (user.password_changed_at && (payload.iat ?? 0) < Math.floor(user.password_changed_at.getTime() / 1000)) {
      return next(new AppError(401, 'Your password was changed. Please log in again.'));
    }
    if (enforcePasswordChange && user.must_change_password) {
      return next(
        new AppError(403, 'You must change your temporary password before continuing.', { code: PASSWORD_CHANGE_REQUIRED }),
      );
    }
    req.user = { ...payload, role: user.role, staff_id: user.staff_id, must_change_password: user.must_change_password };
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireRole(...roles: UserRole[]) {
  return restrictTo(roles);
}

/** Like requireRole, with a domain-specific 403 message. */
export function restrictTo(roles: readonly UserRole[], message = 'You do not have permission to perform this action') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) return next(new AppError(403, message));
    return next();
  };
}

/** Billing data (collections, dues, patient ledgers) is for the HOD and desk staff, not reporting doctors. */
export const REVENUE_ROLES: readonly UserRole[] = ['HOD', 'LAB_TECH'];
export const requireRevenueAccess = restrictTo(
  REVENUE_ROLES,
  'Access Denied: Revenue module is restricted to administrative and desk staff',
);

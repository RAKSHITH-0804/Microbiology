import { NextFunction, Request, Response } from 'express';
import { query } from '../config/db';
import { AppError } from './errorHandler';
import { AUTH_COOKIE, JwtPayload, UserRole, verifyToken } from '../utils/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
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
    const { rows } = await query<{ role: UserRole; is_active: boolean; password_changed_at: Date | null }>(
      'SELECT role, is_active, password_changed_at FROM users WHERE id = $1',
      [payload.sub],
    );
    const user = rows[0];
    if (!user?.is_active) return next(new AppError(401, 'Your account is disabled. Contact the HOD.'));
    if (user.password_changed_at && (payload.iat ?? 0) < Math.floor(user.password_changed_at.getTime() / 1000)) {
      return next(new AppError(401, 'Your password was changed. Please log in again.'));
    }
    req.user = { ...payload, role: user.role };
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, 'You do not have permission to perform this action'));
    }
    return next();
  };
}

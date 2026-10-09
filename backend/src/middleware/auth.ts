import { NextFunction, Request, Response } from 'express';
import { query } from '../config/db';
import { AppError } from './errorHandler';
import { AUTH_COOKIE, AuthUser, JwtPayload, UserRole, verifyToken } from '../utils/jwt';
import type { ModuleKey } from '../modules/permissions/permission.modules';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';
export const MODULE_DISABLED = 'MODULE_DISABLED';

/** Column expression listing the module keys switched off for the user whose id is `userIdSql`. */
export const DISABLED_MODULES_SQL = (userIdSql: string) =>
  `ARRAY(SELECT p.module_key::text FROM user_permissions p WHERE p.user_id = ${userIdSql} AND NOT p.is_enabled ORDER BY p.module_key) AS disabled_modules`;

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
      disabled_modules: string[];
    }>(
      `SELECT role, staff_id, is_active, password_changed_at, must_change_password, ${DISABLED_MODULES_SQL('users.id')}
       FROM users WHERE id = $1`,
      [payload.sub],
    );
    const user = rows[0];
    if (!user?.is_active) return next(new AppError(401, 'Your account is disabled. Contact the administrator.'));
    if (user.password_changed_at && (payload.iat ?? 0) < Math.floor(user.password_changed_at.getTime() / 1000)) {
      return next(new AppError(401, 'Your password was changed. Please log in again.'));
    }
    if (enforcePasswordChange && user.must_change_password) {
      return next(
        new AppError(403, 'You must change your temporary password before continuing.', { code: PASSWORD_CHANGE_REQUIRED }),
      );
    }
    req.user = {
      ...payload,
      role: user.role,
      staff_id: user.staff_id,
      must_change_password: user.must_change_password,
      disabled_modules: user.role === 'SUPER_ADMIN' ? [] : user.disabled_modules,
    };
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

/**
 * Passes when at least one of `modules` is still switched on for the user. Role guards decide whether
 * a role may use a module at all; this only applies the Super Admin's per-user switches on top.
 */
export function requireModule(...modules: ModuleKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    const disabled = req.user.disabled_modules;
    if (modules.every((m) => disabled.includes(m))) {
      return next(new AppError(403, 'Module access disabled by Super Admin', { code: MODULE_DISABLED }));
    }
    return next();
  };
}

/** Master data, user accounts and the audit trail belong to the system administrator alone. */
export const requireSuperAdmin = restrictTo(
  ['SUPER_ADMIN'],
  'Access denied: This module is restricted to the Super Admin',
);

/** Registering requisitions is desk work; doctors only report on them. */
export const requireRequisitionEntry = restrictTo(
  ['SUPER_ADMIN', 'HOD', 'LAB_TECH', 'CLERK'],
  'Access denied: Doctors cannot create or modify requisition records',
);

/** Clerks register new samples but cannot alter them afterwards. */
export const requireRequisitionEdit = restrictTo(
  ['SUPER_ADMIN', 'HOD', 'LAB_TECH'],
  'Access denied: You cannot modify existing requisition records',
);

/** The worklist and requisition directory are clinical working views; clerks only register samples. */
export const requireRequisitionBrowse = restrictTo(
  ['SUPER_ADMIN', 'HOD', 'LAB_TECH', 'DOCTOR'],
  'Access denied: You do not have access to the requisition directory',
);

/** Billing data (collections, dues, patient ledgers) is for administrators and desk staff, not reporting doctors. */
export const REVENUE_ROLES: readonly UserRole[] = ['SUPER_ADMIN', 'HOD', 'LAB_TECH'];
export const requireRevenueAccess = restrictTo(
  REVENUE_ROLES,
  'Access Denied: Revenue module is restricted to administrative and desk staff',
);

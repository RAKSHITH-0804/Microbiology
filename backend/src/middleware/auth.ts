import { NextFunction, Request, Response } from 'express';
import { query } from '../config/db';
import { AppError } from './errorHandler';
import { AUTH_COOKIE, AuthUser, JwtPayload, UserRole, verifyToken } from '../utils/jwt';
import { ModuleKey, MODULE_OVERRIDES_SQL, resolveModules } from '../modules/permissions/permission.modules';

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
export const SESSION_IDLE = 'SESSION_IDLE';

/** Two minutes beyond the client's 15-minute idle sign-out, which shows a warning first. */
export const SESSION_IDLE_LIMIT_SECONDS = 17 * 60;
/** last_seen_at is written at most this often per user. */
const LAST_SEEN_WRITE_SECONDS = 60;
/** Sent by automatic requests (notification polling): checked for idleness but not counted as activity. */
export const BACKGROUND_REQUEST_HEADER = 'X-Background-Request';

/** The Super Admin signs in with fixed credentials and is never sent to the first-login password change. */
export const mustChangePasswordFor = (role: UserRole, flag: boolean) => role !== 'SUPER_ADMIN' && flag;

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
      enabled_modules: string[];
      disabled_modules: string[];
      idle_seconds: number | null;
    }>(
      `SELECT role, staff_id, is_active, password_changed_at, must_change_password, ${MODULE_OVERRIDES_SQL('users.id')},
              EXTRACT(EPOCH FROM NOW() - last_seen_at)::float8 AS idle_seconds
       FROM users WHERE id = $1`,
      [payload.sub],
    );
    const user = rows[0];
    if (!user?.is_active) return next(new AppError(401, 'Your account is disabled. Contact the administrator.'));
    if (user.password_changed_at && (payload.iat ?? 0) < Math.floor(user.password_changed_at.getTime() / 1000)) {
      return next(new AppError(401, 'Your password was changed. Please log in again.'));
    }
    if (user.idle_seconds !== null && user.idle_seconds > SESSION_IDLE_LIMIT_SECONDS) {
      return next(
        new AppError(401, 'You were signed out due to inactivity. Please log in again.', { code: SESSION_IDLE }),
      );
    }
    const background = req.get(BACKGROUND_REQUEST_HEADER) === '1';
    if (!background && (user.idle_seconds === null || user.idle_seconds > LAST_SEEN_WRITE_SECONDS)) {
      await query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [payload.sub]);
    }
    const mustChangePassword = mustChangePasswordFor(user.role, user.must_change_password);
    if (enforcePasswordChange && mustChangePassword) {
      return next(
        new AppError(403, 'You must change your temporary password before continuing.', { code: PASSWORD_CHANGE_REQUIRED }),
      );
    }
    const { modules, granted } = resolveModules(user.role, user.enabled_modules, user.disabled_modules);
    req.user = {
      ...payload,
      role: user.role,
      staff_id: user.staff_id,
      must_change_password: mustChangePassword,
      modules,
      granted_modules: granted,
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

const moduleDisabled = () => new AppError(403, 'Module access disabled by Super Admin', { code: MODULE_DISABLED });

/** Passes when the user can open at least one of `modules` (role default or granted, and not switched off). */
export function requireModule(...modules: ModuleKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    if (!modules.some((m) => req.user!.modules.includes(m))) return next(moduleDisabled());
    return next();
  };
}

/**
 * Role-gated module access. `roles` hold the capability by default; any other role gets it only when the
 * Super Admin explicitly granted one of `modules` to that user. Either way one of `modules` must be on.
 */
export function requireAccess(roles: readonly UserRole[], modules: readonly ModuleKey[], message: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(new AppError(401, 'Authentication required'));
    if (!roles.includes(user.role) && !modules.some((m) => user.granted_modules.includes(m))) {
      return next(new AppError(403, message));
    }
    if (!modules.some((m) => user.modules.includes(m))) return next(moduleDisabled());
    return next();
  };
}

const SUPER_ADMIN_MESSAGE = 'Access denied: This module is restricted to the Super Admin';

/** The permission matrix itself is never delegated, so access can always be taken back. */
export const requireSuperAdmin = restrictTo(['SUPER_ADMIN'], SUPER_ADMIN_MESSAGE);

/** Master data, user accounts and the audit trail: the Super Admin, or staff the Super Admin granted the module. */
export const requireAdminModule = (module: 'master_data' | 'users' | 'audit_logs') =>
  requireAccess(['SUPER_ADMIN'], [module], SUPER_ADMIN_MESSAGE);

/** True for the Super Admin and for users granted `module` beyond their role. */
export const holdsAdminModule = (user: AuthUser, module: ModuleKey) =>
  user.role === 'SUPER_ADMIN' || user.granted_modules.includes(module);

/** Registering requisitions is desk work; doctors only report on them. */
export const requireRequisitionEntry = requireAccess(
  ['SUPER_ADMIN', 'HOD', 'LAB_TECH', 'CLERK'],
  ['new_requisition'],
  'Access denied: Doctors cannot create or modify requisition records',
);

/** Clerks register new samples but cannot alter them afterwards. Edits open from the worklist or the directory. */
export const requireRequisitionEdit = requireAccess(
  ['SUPER_ADMIN', 'HOD', 'LAB_TECH'],
  ['requisitions', 'pending_worklist'],
  'Access denied: You cannot modify existing requisition records',
);

/** The worklist and requisition directory are clinical working views; clerks only register samples. */
export const requireRequisitionBrowse = (module: 'requisitions' | 'pending_worklist') =>
  requireAccess(
    ['SUPER_ADMIN', 'HOD', 'LAB_TECH', 'DOCTOR'],
    [module],
    'Access denied: You do not have access to the requisition directory',
  );

/** Billing data (collections, dues, patient ledgers) is for administrators and desk staff, not reporting doctors. */
export const REVENUE_ROLES: readonly UserRole[] = ['SUPER_ADMIN', 'HOD', 'LAB_TECH'];
export const requireRevenueAccess = requireAccess(
  REVENUE_ROLES,
  ['billing'],
  'Access Denied: Revenue module is restricted to administrative and desk staff',
);

/** The requireRevenueAccess rule, for responses that carry billing-only detail. */
export const hasRevenueAccess = (user: AuthUser) =>
  (REVENUE_ROLES.includes(user.role) || user.granted_modules.includes('billing')) && user.modules.includes('billing');

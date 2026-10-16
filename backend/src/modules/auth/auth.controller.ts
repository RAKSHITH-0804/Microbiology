import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../config/db';
import { mustChangePasswordFor } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { writeAuditLog } from '../../utils/audit';
import { notifyUserManagers, resolveNotifications } from '../notifications/notification.service';
import { MODULE_OVERRIDES_SQL, resolveModules } from '../permissions/permission.modules';
import { AUTH_COOKIE, authCookieOptions, signToken, UserRole, verifyToken } from '../../utils/jwt';
import { ChangePasswordInput, ForgotPasswordInput, LoginInput } from './auth.schema';

const BCRYPT_ROUNDS = 10;

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  staff_id: number | null;
  staff_name: string | null;
  designation: string | null;
  must_change_password: boolean;
  enabled_modules: string[];
  disabled_modules: string[];
}

const USER_SELECT = `
  SELECT u.id, u.username, u.password_hash, u.role, u.is_active, u.staff_id, u.must_change_password,
         s.name AS staff_name, s.designation, ${MODULE_OVERRIDES_SQL('u.id')}
  FROM users u
  LEFT JOIN master_staff s ON s.id = u.staff_id`;

function toPublicUser(row: UserRow) {
  const { modules, granted } = resolveModules(row.role, row.enabled_modules, row.disabled_modules);
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    staffId: row.staff_id,
    name: row.staff_name ?? row.username,
    designation: row.designation,
    mustChangePassword: mustChangePasswordFor(row.role, row.must_change_password),
    modules,
    grantedModules: granted,
  };
}

/** Longest attempted username kept in the audit trail (the audit_logs.username column width). */
const AUDIT_USERNAME_MAX = 50;

/** Records a rejected sign-in: who was attempted and from where. The password is never part of it. */
async function auditFailedLogin(req: Request, username: string, reason: string, accountId: number | null) {
  await writeAuditLog({
    userId: null,
    username: username.slice(0, AUDIT_USERNAME_MAX),
    action: 'LOGIN_FAILED',
    entityName: 'users',
    entityId: accountId,
    details: { reason, ip: req.ip, userAgent: req.get('user-agent') },
  });
}

export async function login(req: Request, res: Response) {
  const { username, password } = req.body as LoginInput;

  const { rows } = await query<UserRow>(`${USER_SELECT} WHERE LOWER(u.username) = LOWER($1)`, [username]);
  const user = rows[0];

  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !valid) {
    await auditFailedLogin(req, username, user ? 'bad_password' : 'unknown_user', user?.id ?? null);
    throw new AppError(401, 'Invalid username or password');
  }
  if (!user.is_active) {
    await auditFailedLogin(req, username, 'disabled', user.id);
    throw new AppError(403, 'Your account is disabled. Contact the HOD.');
  }

  await query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [user.id]);
  const token = signToken({ sub: user.id, username: user.username, role: user.role });
  res.cookie(AUTH_COOKIE, token, authCookieOptions);

  await writeAuditLog({
    userId: user.id,
    action: 'LOGIN',
    entityName: 'users',
    entityId: user.id,
    details: { ip: req.ip, userAgent: req.get('user-agent') },
  });

  res.json({ success: true, data: { user: toPublicUser(user) } });
}

/**
 * Flags the account for the Super Admin, who issues a temporary password from User Management.
 * Answers the same whether or not the account exists, so it cannot be used to probe usernames.
 */
export async function forgotPassword(req: Request, res: Response) {
  const { username } = req.body as ForgotPasswordInput;
  const staffId = /^\d{1,9}$/.test(username) ? Number(username) : null;

  const { rows } = await query<{ id: number; username: string; staff_name: string | null; already_requested: boolean }>(
    `SELECT u.id, u.username, s.name AS staff_name, u.password_reset_requested AS already_requested
     FROM users u LEFT JOIN master_staff s ON s.id = u.staff_id
     WHERE u.is_active AND u.role <> 'SUPER_ADMIN'
       AND (LOWER(u.username) = LOWER($1) OR u.staff_id = $2)
     ORDER BY LOWER(u.username) = LOWER($1) DESC
     LIMIT 1`,
    [username, staffId],
  );
  const user = rows[0];

  if (user) {
    await withTransaction(async (client) => {
      await client.query(
        'UPDATE users SET password_reset_requested = TRUE, password_reset_requested_at = NOW() WHERE id = $1',
        [user.id],
      );
      // Repeated requests for the same account keep the one open notification.
      if (!user.already_requested) {
        const who = user.staff_name ? `${user.staff_name} (${user.username})` : user.username;
        await notifyUserManagers(client, {
          type: 'PASSWORD_RESET',
          title: 'Password reset requested',
          message: `${who} asked for a password reset.`,
          link: '/users',
          entityName: 'users',
          entityId: user.id,
        });
      }
      await writeAuditLog(
        {
          userId: user.id,
          action: 'PASSWORD_RESET_REQUESTED',
          entityName: 'users',
          entityId: user.id,
          details: { username: user.username, ip: req.ip, userAgent: req.get('user-agent') },
        },
        client,
      );
    });
  }

  res.json({ success: true, message: 'Reset request recorded' });
}

export async function logout(req: Request, res: Response) {
  const { maxAge: _maxAge, ...clearOptions } = authCookieOptions;
  const token: string | undefined = req.cookies?.[AUTH_COOKIE];
  res.clearCookie(AUTH_COOKIE, clearOptions);

  if (token) {
    try {
      const { sub } = verifyToken(token);
      await writeAuditLog({ userId: sub, action: 'LOGOUT', entityName: 'users', entityId: sub });
    } catch {
      // Expired or tampered token: the cookie is cleared regardless.
    }
  }
  res.json({ success: true, message: 'Logged out' });
}

/** Reports user activity seen only in the browser (typing, scrolling), so the server-side idle timer stays in step. */
export async function heartbeat(_req: Request, res: Response) {
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const { rows } = await query<UserRow>(`${USER_SELECT} WHERE u.id = $1`, [req.user!.sub]);
  const user = rows[0];
  if (!user || !user.is_active) throw new AppError(401, 'User no longer active');

  // The newest LOGIN is the current session; the one before it is the user's previous visit.
  const logins = await query<{ created_at: Date }>(
    `SELECT created_at FROM audit_logs WHERE user_id = $1 AND action = 'LOGIN' ORDER BY created_at DESC LIMIT 2`,
    [user.id],
  );
  const pwd = await query<{ password_changed_at: Date | null }>('SELECT password_changed_at FROM users WHERE id = $1', [user.id]);

  res.json({
    success: true,
    data: {
      user: toPublicUser(user),
      session: {
        currentLoginAt: logins.rows[0]?.created_at ?? null,
        previousLoginAt: logins.rows[1]?.created_at ?? null,
        passwordChangedAt: pwd.rows[0]?.password_changed_at ?? null,
      },
    },
  });
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;
  const userId = req.user!.sub;

  const { rows } = await query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const valid = rows[0] ? await bcrypt.compare(currentPassword, rows[0].password_hash) : false;
  // 400 rather than 401: a typo must not look like an expired session to the client.
  if (!valid) {
    throw new AppError(400, 'Current password is incorrect', { currentPassword: ['Current password is incorrect'] });
  }

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const changedAt = new Date();
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET password_hash = $2, password_changed_at = $3, must_change_password = FALSE,
                        password_reset_requested = FALSE, password_reset_requested_at = NULL
       WHERE id = $1`,
      [userId, hash, changedAt],
    );
    await resolveNotifications(client, 'PASSWORD_RESET', 'users', userId);
    await writeAuditLog(
      {
        userId,
        action: 'PASSWORD_CHANGE',
        entityName: 'users',
        entityId: userId,
        details: { ip: req.ip, ...(req.user!.must_change_password && { first_login: true }) },
      },
      client,
    );
  });

  // Every other session is now invalid; keep this one signed in with a fresh token.
  const { sub, username, role } = req.user!;
  res.cookie(AUTH_COOKIE, signToken({ sub, username, role }), authCookieOptions);
  res.json({ success: true, message: 'Password changed successfully' });
}

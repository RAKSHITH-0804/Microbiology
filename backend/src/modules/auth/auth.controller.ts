import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { writeAuditLog } from '../../utils/audit';
import { AUTH_COOKIE, authCookieOptions, signToken, UserRole, verifyToken } from '../../utils/jwt';
import { ChangePasswordInput, LoginInput } from './auth.schema';

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
}

const USER_SELECT = `
  SELECT u.id, u.username, u.password_hash, u.role, u.is_active, u.staff_id,
         s.name AS staff_name, s.designation
  FROM users u
  LEFT JOIN master_staff s ON s.id = u.staff_id`;

function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    staffId: row.staff_id,
    name: row.staff_name ?? row.username,
    designation: row.designation,
  };
}

export async function login(req: Request, res: Response) {
  const { username, password } = req.body as LoginInput;

  const { rows } = await query<UserRow>(`${USER_SELECT} WHERE LOWER(u.username) = LOWER($1)`, [username]);
  const user = rows[0];

  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !valid) throw new AppError(401, 'Invalid username or password');
  if (!user.is_active) throw new AppError(403, 'Your account is disabled. Contact the HOD.');

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
    await client.query('UPDATE users SET password_hash = $2, password_changed_at = $3 WHERE id = $1', [userId, hash, changedAt]);
    await writeAuditLog(
      { userId, action: 'PASSWORD_CHANGE', entityName: 'users', entityId: userId, details: { ip: req.ip } },
      client,
    );
  });

  // Every other session is now invalid; keep this one signed in with a fresh token.
  const { sub, username, role } = req.user!;
  res.cookie(AUTH_COOKIE, signToken({ sub, username, role }), authCookieOptions);
  res.json({ success: true, message: 'Password changed successfully' });
}

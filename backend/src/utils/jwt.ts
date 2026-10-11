import jwt, { SignOptions } from 'jsonwebtoken';
import { CookieOptions } from 'express';
import { env, isProduction } from '../config/env';
import type { ModuleKey } from '../modules/permissions/permission.modules';

export type UserRole = 'SUPER_ADMIN' | 'HOD' | 'DOCTOR' | 'LAB_TECH' | 'CLERK';

export interface JwtPayload {
  sub: number;
  username: string;
  role: UserRole;
  /** Issued-at (seconds), added by jsonwebtoken when signing. */
  iat?: number;
}

/** The authenticated user attached to `req.user`; role and staff link are re-read from the database per request. */
export interface AuthUser extends JwtPayload {
  staff_id: number | null;
  must_change_password: boolean;
  /** Modules the user can open: role defaults with the Super Admin's per-user overrides applied. */
  modules: ModuleKey[];
  /** Modules granted beyond the role's defaults; they unlock that module's routes regardless of role. */
  granted_modules: ModuleKey[];
}

export const AUTH_COOKIE = 'token';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === 'string') throw new Error('Invalid token payload');
  return decoded as unknown as JwtPayload;
}

export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
  maxAge: COOKIE_MAX_AGE_MS,
};

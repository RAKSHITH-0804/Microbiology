import jwt, { SignOptions } from 'jsonwebtoken';
import { CookieOptions } from 'express';
import { env, isProduction } from '../config/env';

export type UserRole = 'HOD' | 'DOCTOR' | 'LAB_TECH';

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

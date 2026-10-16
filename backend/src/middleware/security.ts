import type { CorsOptions } from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const DEFAULT_ALLOWED_ORIGINS = [
  /^https:\/\/([a-z0-9-]+\.)*indigocomputers\.in$/i,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

const explicitOrigins = env.FRONTEND_URL
  ? env.FRONTEND_URL.split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  : null;

function isAllowedOrigin(origin: string): boolean {
  if (explicitOrigins) return explicitOrigins.includes(origin);
  return DEFAULT_ALLOWED_ORIGINS.some((pattern) => pattern.test(origin));
}

export const corsOptions: CorsOptions = {
  // Requests without an Origin header (same-origin, curl, health checks) are not CORS requests.
  origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 600,
};

/** The automated test suite makes far more requests from one address than any user would. */
const skipInTests = () => env.NODE_ENV === 'test';

/** Counts only failed logins (4xx/5xx), so staff who sign in correctly are never locked out. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  skip: skipInTests,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many failed login attempts. Please try again after 15 minutes.' },
});

/** Every request counts: the endpoint always succeeds, and each call writes an audit entry. */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many password reset requests. Please try again after 15 minutes.' },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 150,
  skip: skipInTests,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down and try again in a minute.' },
});

/**
 * Patient billing lookups, per signed-in user (mount after requireAuth): enough for desk work,
 * too few to walk through the patient register by name or phone number.
 */
export const ledgerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `user:${req.user?.sub ?? 'anonymous'}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many patient ledger searches. Please wait a minute and try again.' },
});

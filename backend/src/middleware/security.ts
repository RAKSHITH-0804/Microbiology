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

/** Counts only failed logins (4xx/5xx), so staff who sign in correctly are never locked out. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many failed login attempts. Please try again after 15 minutes.' },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 150,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down and try again in a minute.' },
});

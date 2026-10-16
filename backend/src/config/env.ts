import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const JWT_SECRET_MIN_LENGTH = 32;
/** Sample values from docs and .env.example; a deployment still using one has a publicly known secret. */
const JWT_SECRET_PLACEHOLDERS = [
  'secret',
  'jwt_secret',
  'your_jwt_secret',
  'your-jwt-secret',
  'your_secret_key',
  'your-secret-key',
  'changeme',
  'change_me',
  'change_me_to_a_long_random_string',
];

/** Why `secret` is unfit for signing session tokens, or null when it is acceptable. */
export function jwtSecretProblem(secret: string): string | null {
  const normalized = secret.trim().toLowerCase();
  if (JWT_SECRET_PLACEHOLDERS.includes(normalized) || /change[_-]?me/.test(normalized)) {
    return 'JWT_SECRET is still a placeholder value; generate a long random secret';
  }
  if (secret.length < JWT_SECRET_MIN_LENGTH) {
    return `JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters`;
  }
  return null;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  /** Comma-separated origins allowed to call the API with cookies; unset = *.indigocomputers.in + localhost. */
  FRONTEND_URL: z.string().trim().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

const secretProblem = jwtSecretProblem(env.JWT_SECRET);
if (secretProblem) {
  if (isProduction) {
    console.error(`Invalid environment configuration: ${secretProblem}. Refusing to start.`);
    process.exit(1);
  }
  console.warn(`Warning: ${secretProblem}. The server will refuse to start in production.`);
}

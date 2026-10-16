import path from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { jwtSecretProblem } from '../src/config/env';

const BACKEND_DIR = path.resolve(__dirname, '..');
const STRONG_SECRET = 'a3f9c1e7b5d2084f6e1a9c3b7d5f2e8a0c4b6d8e1f3a5c7b';

/** Loads the env module in a fresh process, as the server does at start-up. */
const loadEnv = (env: Record<string, string>) =>
  spawnSync(process.execPath, ['--import', 'tsx', 'src/config/env.ts'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });

describe('JWT_SECRET validation', () => {
  it.each([
    ['too short', 'short-but-not-a-placeholder-1'],
    ['the .env.example placeholder', 'change_me_to_a_long_random_string'],
    ['a placeholder in other case', 'CHANGE_ME'],
    ['a long value containing change-me', 'please-change-me-before-going-live-0123456789'],
    ['a common sample value', 'your_jwt_secret'],
  ])('rejects %s', (_label, secret) => {
    expect(jwtSecretProblem(secret)).not.toBeNull();
  });

  it('accepts a long random secret', () => {
    expect(jwtSecretProblem(STRONG_SECRET)).toBeNull();
  });

  it('refuses to start in production with a weak secret', () => {
    const result = loadEnv({ NODE_ENV: 'production', JWT_SECRET: 'change_me_to_a_long_random_string' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Refusing to start/);
  });

  it('starts in production with a strong secret', () => {
    const result = loadEnv({ NODE_ENV: 'production', JWT_SECRET: STRONG_SECRET });
    expect(result.status, result.stderr).toBe(0);
  });

  it('only warns outside production', () => {
    const result = loadEnv({ NODE_ENV: 'development', JWT_SECRET: 'short-but-not-a-placeholder-1' });
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/refuse to start in production/);
  });
});

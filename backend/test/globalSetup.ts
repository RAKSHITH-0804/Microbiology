import path from 'path';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';
import { Client } from 'pg';
import { TEST_DB_NAME } from '../vitest.config';

const DATABASE_DIR = path.resolve(__dirname, '../../database');

/** Connection settings from backend/.env, pointed at the test database. */
export function testDbEnv(): NodeJS.ProcessEnv {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  if (!TEST_DB_NAME.endsWith('_test')) throw new Error(`Refusing to use "${TEST_DB_NAME}" as a test database`);
  return { ...process.env, DB_NAME: TEST_DB_NAME, NODE_ENV: 'test' };
}

/** Drops and recreates the test database, then applies every migration to it. */
export default async function setup() {
  const env = testDbEnv();
  const admin = new Client({
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 5432),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: 'postgres',
  });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await admin.end();
  }
  execFileSync(process.execPath, [path.join(DATABASE_DIR, 'migrate.js')], { env, cwd: DATABASE_DIR, stdio: 'pipe' });
}

import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import { env } from './env';

// int8 (COUNT(*), amounts in paise) as JS numbers; refuse values that a double cannot hold exactly.
types.setTypeParser(types.builtins.INT8, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`int8 value ${value} is outside the safe integer range`);
  return n;
});

export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

export function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

import { afterAll } from 'vitest';
import { pool } from '../src/config/db';

afterAll(async () => {
  await pool.end();
});

#!/usr/bin/env node
/**
 * Applies SQL files from ./migrations in filename order. Each file runs in
 * its own transaction and is recorded in schema_migrations so it only runs once.
 *
 *   node migrate.js           apply pending migrations
 *   node migrate.js --status  list applied / pending migrations
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function main() {
  const statusOnly = process.argv.includes('--status');
  const client = createClient();
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    VARCHAR(255) PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (statusOnly) {
      for (const f of files) console.log(`${applied.has(f) ? '[applied]' : '[pending]'} ${f}`);
      return;
    }

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log('Database is up to date.');
      return;
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`Applying ${file} ... `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log('done');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        throw err;
      }
    }
    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  if (err.code === '3D000') {
    console.error(`Database "${process.env.DB_NAME}" does not exist. Create it first (see README).`);
  }
  process.exit(1);
});

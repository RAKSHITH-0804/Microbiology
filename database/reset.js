#!/usr/bin/env node
/**
 * Development-only clean slate: drops every table, re-applies all migrations and re-seeds
 * master data + staff logins. ALL requisitions, reports, payments and audit logs are lost.
 *
 *   npm run db:reset
 */
const path = require('path');
const { execFileSync } = require('child_process');
const { createClient } = require('./db');

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: Database reset is prohibited in production mode!');
  }

  const client = createClient();
  await client.connect();
  try {
    console.log(`Resetting database "${process.env.DB_NAME}" on ${process.env.DB_HOST || 'localhost'} ...`);
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('Schema dropped and recreated.');
  } finally {
    await client.end();
  }

  for (const script of ['migrate.js', 'seed.js']) {
    execFileSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit', cwd: __dirname });
  }
  console.log('Database reset complete.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

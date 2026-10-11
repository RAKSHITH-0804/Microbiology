#!/usr/bin/env node
/**
 * Creates or re-aligns the static Super Admin login ("superadmin") with SUPERADMIN_DEFAULT_PASSWORD.
 * Run by the seeder, or on its own:   npm run db:superadmin
 *
 * Accounts whose password already matches are left alone, so their open sessions survive a re-run.
 */
const bcrypt = require('bcryptjs');
const { createClient } = require('./db');

const SUPERADMIN_USERNAME = 'superadmin';
const BCRYPT_ROUNDS = 10;

const superAdminPassword = () => process.env.SUPERADMIN_DEFAULT_PASSWORD || 'admin@123';

/** Returns { created, updated, unchanged } as lists of usernames. */
async function ensureSuperAdmin(client) {
  const password = superAdminPassword();
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = { created: [], updated: [], unchanged: [] };

  const { rows } = await client.query(
    `SELECT id, username, password_hash, must_change_password FROM users
     WHERE LOWER(username) = $1 OR role = 'SUPER_ADMIN'`,
    [SUPERADMIN_USERNAME],
  );

  if (!rows.some((u) => u.username.toLowerCase() === SUPERADMIN_USERNAME)) {
    await client.query(
      `INSERT INTO users (username, password_hash, role, must_change_password) VALUES ($1, $2, 'SUPER_ADMIN', FALSE)`,
      [SUPERADMIN_USERNAME, hash],
    );
    result.created.push(SUPERADMIN_USERNAME);
  }

  for (const user of rows) {
    if (await bcrypt.compare(password, user.password_hash)) {
      if (user.must_change_password) {
        await client.query('UPDATE users SET must_change_password = FALSE WHERE id = $1', [user.id]);
      }
      result.unchanged.push(user.username);
      continue;
    }
    // password_changed_at signs out sessions opened with the old password.
    await client.query(
      `UPDATE users SET password_hash = $2, role = CASE WHEN LOWER(username) = $3 THEN 'SUPER_ADMIN' ELSE role END,
                        must_change_password = FALSE, password_changed_at = NOW(),
                        password_reset_requested = FALSE, password_reset_requested_at = NULL
       WHERE id = $1`,
      [user.id, hash, SUPERADMIN_USERNAME],
    );
    result.updated.push(user.username);
  }
  return result;
}

async function main() {
  const client = createClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await ensureSuperAdmin(client);
    await client.query('COMMIT');
    console.log('Super Admin login:');
    for (const name of result.created) console.log(`  + ${name} created`);
    for (const name of result.updated) console.log(`  * ${name} password reset to SUPERADMIN_DEFAULT_PASSWORD`);
    for (const name of result.unchanged) console.log(`  = ${name} already up to date`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Super Admin update failed:', err.message);
    process.exit(1);
  });
}

module.exports = { ensureSuperAdmin, SUPERADMIN_USERNAME };

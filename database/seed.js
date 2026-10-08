#!/usr/bin/env node
/**
 * Idempotent seeder: master data from ./seed-data and a login for every staff member.
 * Safe to run repeatedly; existing rows are left untouched.
 */
const bcrypt = require('bcryptjs');
const { createClient } = require('./db');

const staff = require('./seed-data/staff.json');
const samples = require('./seed-data/samples.json');
const organisms = require('./seed-data/organisms.json');
const antibiotics = require('./seed-data/antibiotics.json');
const testTemplates = require('./seed-data/test_templates.json');
const testCatalog = require('./seed-data/test_catalog.json').map((t, i) => ({ ...t, sort_order: i + 1 }));

const DEFAULT_HOD = { username: 'hod', password: 'admin123' };
const DEFAULT_STAFF_PASSWORD = 'password123';
const BCRYPT_ROUNDS = 12;

/** Multi-row INSERT ... ON CONFLICT DO NOTHING; returns number of inserted rows. */
async function bulkInsert(client, table, columns, rows, conflictTarget) {
  if (rows.length === 0) return 0;
  const values = [];
  const tuples = rows.map((row, i) => {
    columns.forEach((c) => values.push(row[c] ?? null));
    return `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`;
  });
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}
               ON CONFLICT ${conflictTarget} DO NOTHING`;
  const res = await client.query(sql, values);
  return res.rowCount;
}

/** "Dr.Rajendra Prasad.B.P.M." -> "rajendra"; "Mr.Nazeer Ahmed. C.A" -> "nazeer". */
function firstName(staffName) {
  const withoutTitle = staffName.replace(/^\s*(mrs|miss|mr|ms|dr)\b\.?\s*/i, '');
  return withoutTitle.split(/[\s.]+/).find(Boolean).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function accountFor(member) {
  if (/\bHOD\b/i.test(member.designation)) {
    return { username: DEFAULT_HOD.username, role: 'HOD', password: DEFAULT_HOD.password };
  }
  if (member.staff_type === 'TEACHING') {
    return { username: `dr.${firstName(member.name)}`, role: 'DOCTOR', password: DEFAULT_STAFF_PASSWORD };
  }
  return { username: firstName(member.name), role: 'LAB_TECH', password: DEFAULT_STAFF_PASSWORD };
}

/** One login per active staff member that has no account yet; existing accounts are never touched. */
async function seedStaffUsers(client) {
  const { rows: unlinked } = await client.query(
    `SELECT s.id, s.name, s.designation, s.staff_type
     FROM master_staff s
     WHERE s.is_active AND NOT EXISTS (SELECT 1 FROM users u WHERE u.staff_id = s.id)
     ORDER BY s.id`,
  );

  const created = [];
  const skipped = [];
  for (const member of unlinked) {
    const account = accountFor(member);
    const hash = await bcrypt.hash(account.password, BCRYPT_ROUNDS);
    const res = await client.query(
      `INSERT INTO users (username, password_hash, role, staff_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT ((LOWER(username))) DO NOTHING`,
      [account.username, hash, account.role, member.id],
    );
    (res.rowCount ? created : skipped).push({ ...account, staff: member.name });
  }
  return { created, skipped };
}

async function main() {
  const client = createClient();
  await client.connect();

  try {
    await client.query('BEGIN');

    const results = {
      master_staff: await bulkInsert(client, 'master_staff', ['name', 'designation', 'staff_type'], staff, '(name, designation)'),
      master_samples: await bulkInsert(client, 'master_samples', ['sample_name'], samples, '(sample_name)'),
      master_organisms: await bulkInsert(client, 'master_organisms', ['category', 'organism_name'], organisms, '(category, organism_name)'),
      master_antibiotics: await bulkInsert(client, 'master_antibiotics', ['antibiotic_name', 'short_code'], antibiotics, '(antibiotic_name)'),
      master_test_templates: await bulkInsert(client, 'master_test_templates', ['test_name', 'finding_text'], testTemplates, '(test_name, finding_text)'),
      master_test_catalog: await bulkInsert(
        client,
        'master_test_catalog',
        ['category', 'test_name', 'template_test_name', 'sort_order'],
        testCatalog,
        '(category, test_name)',
      ),
    };
    const users = await seedStaffUsers(client);

    await client.query('COMMIT');

    console.log('Seed complete (newly inserted rows):');
    for (const [table, count] of Object.entries(results)) console.log(`  ${table.padEnd(24)} ${count}`);
    console.log(`  ${'users'.padEnd(24)} ${users.created.length}`);
    for (const u of users.created) {
      console.log(`    + ${u.username.padEnd(18)} ${u.role.padEnd(9)} ${u.password.padEnd(12)} ${u.staff}`);
    }
    for (const u of users.skipped) {
      console.log(`    ! ${u.username.padEnd(18)} username already taken - no account created for ${u.staff}`);
    }
    if (users.created.some((u) => u.password === DEFAULT_STAFF_PASSWORD)) {
      console.log(`  New staff accounts share the default password "${DEFAULT_STAFF_PASSWORD}".`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Seeding failed:', err.message);
  if (err.code === '42P01') console.error('Tables are missing. Run "npm run db:migrate" first.');
  process.exit(1);
});

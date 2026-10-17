#!/usr/bin/env node
/**
 * Idempotent seeder: master data from ./seed-data and a login for every staff member.
 * Safe to run repeatedly; existing rows are left untouched.
 */
const bcrypt = require('bcryptjs');
const { createClient } = require('./db');
const { ensureSuperAdmin } = require('./superadmin');

const staff = require('./seed-data/staff.json');
const samples = require('./seed-data/samples.json');
const organisms = require('./seed-data/organisms.json');
const antibiotics = require('./seed-data/antibiotics.json');
const testTemplates = require('./seed-data/test_templates.json');
const testCatalog = require('./seed-data/test_catalog.json').map((t, i) => ({ ...t, sort_order: i + 1 }));

const DEFAULT_HOD_USERNAME = 'hod';
/** Initial password for every staff login (HOD, doctors, lab staff); replaced at first sign-in. */
const DEFAULT_STAFF_PASSWORD = 'pass1234';
const BCRYPT_ROUNDS = 10;

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

/** Teaching HODs get both an HOD login (no staff link) and a doctor login linked to the staff row. */
function accountsFor(member) {
  const isHod = /\bHOD\b/i.test(member.designation);
  const isTeaching = member.staff_type === 'TEACHING';
  if (isHod && isTeaching) {
    return [
      { username: DEFAULT_HOD_USERNAME, role: 'HOD', linkStaff: false },
      { username: `dr.${firstName(member.name)}`, role: 'DOCTOR', linkStaff: true },
    ];
  }
  if (isHod) {
    return [{ username: DEFAULT_HOD_USERNAME, role: 'HOD', linkStaff: true }];
  }
  if (isTeaching) {
    return [{ username: `dr.${firstName(member.name)}`, role: 'DOCTOR', linkStaff: true }];
  }
  return [{ username: firstName(member.name), role: 'LAB_TECH', linkStaff: true }];
}

/** Ensure every active staff member has their expected login(s); existing usernames are never updated. */
async function seedStaffUsers(client) {
  const { rows: members } = await client.query(
    `SELECT s.id, s.name, s.designation, s.staff_type
     FROM master_staff s
     WHERE s.is_active
     ORDER BY s.id`,
  );

  const created = [];
  const skipped = [];
  const hash = await bcrypt.hash(DEFAULT_STAFF_PASSWORD, BCRYPT_ROUNDS);
  for (const member of members) {
    for (const account of accountsFor(member)) {
      const staffId = account.linkStaff ? member.id : null;
      const res = await client.query(
        `INSERT INTO users (username, password_hash, role, staff_id, must_change_password) VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT ((LOWER(username))) DO NOTHING`,
        [account.username, hash, account.role, staffId],
      );
      const entry = { username: account.username, role: account.role, staff: member.name };
      (res.rowCount ? created : skipped).push(entry);
    }
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
    const superAdmin = await ensureSuperAdmin(client);

    await client.query('COMMIT');

    console.log('Seed complete (newly inserted rows):');
    for (const [table, count] of Object.entries(results)) console.log(`  ${table.padEnd(24)} ${count}`);
    console.log(`  ${'users'.padEnd(24)} ${users.created.length}`);
    for (const u of users.created) {
      console.log(`    + ${u.username.padEnd(18)} ${u.role.padEnd(9)} ${u.staff}`);
    }
    for (const u of users.skipped) {
      console.log(`    ! ${u.username.padEnd(18)} username already taken - no account created for ${u.staff}`);
    }
    if (users.created.length) {
      console.log(`  New staff accounts (HOD included) start on "${DEFAULT_STAFF_PASSWORD}" and must change it at first login.`);
    }
    const synced = [...superAdmin.created, ...superAdmin.updated];
    console.log(
      synced.length
        ? `  Super Admin login set from SUPERADMIN_DEFAULT_PASSWORD: ${synced.join(', ')}`
        : '  Super Admin login already matches SUPERADMIN_DEFAULT_PASSWORD.',
    );
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

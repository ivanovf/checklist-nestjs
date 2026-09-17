/**
 * Read-only audit of stored account roles.
 *
 * `User.role` becomes a required enum with a least-privileged default. Before that constraint
 * is relied on, every existing account must hold a valid role — an account whose role is
 * absent, empty, or misspelled currently yields `undefined`, which authorization must never
 * treat as permissible.
 *
 * This reports; it does not write. Correct any account it names before trusting the constraint.
 *
 * Usage:  NODE_ENV=local npx ts-node scripts/audit-user-roles.ts
 */
import { config as loadEnv } from 'dotenv';
import mongoose from 'mongoose';

import { Role } from '../src/auth/models/role.model';

loadEnv({ path: `.env.${process.env.NODE_ENV || 'local'}` });

async function main(): Promise<void> {
  const port = process.env.DB_PORT ? `:${process.env.DB_PORT}` : '';
  const args = process.env.DB_ARGS ? `?${process.env.DB_ARGS}` : '';
  const uri = `${process.env.DB_DRIVE}://${process.env.DB_HOST}${port}/${args}`;

  await mongoose.connect(uri, {
    user: process.env.DB_USER,
    pass: process.env.DB_PASS,
    dbName: process.env.DB_NAME,
  });

  const valid = Object.values(Role);
  const users = mongoose.connection.collection('users');

  const invalid = await users
    .find(
      { $or: [{ role: { $exists: false } }, { role: { $nin: valid } }] },
      { projection: { email: 1, role: 1 } },
    )
    .toArray();

  const total = await users.countDocuments();

  console.log(`Accounts scanned: ${total}`);
  console.log(`Valid roles: ${valid.join(', ')}`);

  if (invalid.length === 0) {
    console.log('OK — every account holds a valid role.');
  } else {
    console.log(`\n${invalid.length} account(s) need correction:\n`);
    for (const u of invalid) {
      console.log(`  ${String(u._id)}  ${u.email ?? '(no email)'}  role=${JSON.stringify(u.role)}`);
    }
    console.log(
      '\nCorrect these before relying on the required-enum constraint. ' +
        'Accounts default to the least-privileged role; promote deliberately, never in bulk.',
    );
  }

  await mongoose.disconnect();
  process.exitCode = invalid.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(2);
});

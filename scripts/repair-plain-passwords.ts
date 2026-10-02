/**
 * One-off repair for D17: hashes account passwords that were stored as plain text.
 *
 * A thin runner. It boots the application context, so the target database comes from the env
 * file `NODE_ENV` names, and hands the account model to src/users/password-repair.ts, where the
 * logic and its tests live.
 *
 * A dry run is the default: it lists the accounts it would repair, by id only, and writes
 * nothing. Read that list before applying.
 *
 * Usage:  NODE_ENV=local pnpm db:repair-passwords            # dry run
 *         NODE_ENV=local pnpm db:repair-passwords --apply    # write
 *
 * Exit codes: 0 nothing left to repair, 1 a dry run found accounts to repair, 2 failure.
 *
 * Production: the constitution says production credentials MUST NOT be usable from a developer
 * machine. Run it against production only from an environment approved for those credentials,
 * or with a short-lived, least-privilege database user created for the run and removed after.
 */
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User } from '../src/users/entities/user.entity';
import {
  formatReport,
  repairPlainTextPasswords,
} from '../src/users/password-repair';

async function main(): Promise<number> {
  // Required, never defaulted: it decides which env file, and so which database, is touched.
  if (!process.env.NODE_ENV) {
    console.error(
      'NODE_ENV is required: it names the env file, and so the database, to repair.\n' +
        'Example: NODE_ENV=local pnpm db:repair-passwords',
    );
    return 2;
  }

  // Loaded only now: importing AppModule validates the configuration straight away, which
  // would fail on a missing NODE_ENV before the check above could explain it.
  const { AppModule } = await import('../src/app.module');
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const users = app.get<Model<User>>(getModelToken(User.name));
    const result = await repairPlainTextPasswords(users, { apply });

    console.log(formatReport(result));

    return !apply && result.toRepair.length > 0 ? 1 : 0;
  } finally {
    await app.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`\nRepair failed: ${(error as Error).message}`);
    process.exitCode = 2;
  },
);

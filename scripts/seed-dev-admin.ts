/**
 * Creates the local development administrator.
 *
 * A thin runner: it boots the application context so the real UsersService does the work,
 * and holds no logic of its own. The logic lives in src/users/dev-admin-seed.ts, where jest
 * discovers it — a spec placed beside this file would never run, because jest's rootDir is
 * `src`.
 *
 * Usage:  pnpm db:seed
 */
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { seedDevAdmin } from '../src/users/dev-admin-seed';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    await seedDevAdmin(app.get(UsersService));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  // The overwhelmingly common cause is the database not being up yet, and the driver's own
  // message does not suggest the fix.
  console.error(`\nSeeding failed: ${(error as Error).message}`);
  console.error('Is the database running? Start it with: pnpm db:up\n');
  process.exit(1);
});

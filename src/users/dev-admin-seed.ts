import { Logger } from '@nestjs/common';

import { UsersService } from './users.service';
import { Role } from '../auth/models/role.model';

/**
 * Credentials for the local development administrator.
 *
 * Synthetic and published in this repository, which is exactly why they must never be reused
 * anywhere a deployment can reach. The account exists to break a deadlock: creating an
 * account requires an administrator and signing in requires an existing account, so an empty
 * database cannot produce its first administrator through the API at all.
 */
export const DEV_ADMIN = {
  email: 'dev.admin@localhost.test',
  name: 'Local Development Admin',
  password: 'localdevadmin',
  role: Role.ADMIN,
} as const;

export type SeedOutcome = 'created' | 'already-exists' | 'exists-without-admin';

/**
 * Creates the development administrator if it is absent, and otherwise leaves the database
 * exactly as it found it.
 *
 * Goes through UsersService rather than writing the document directly, so password hashing,
 * schema defaults and the role enum are reused instead of reimplemented — the alternative
 * would duplicate a rule the service owns and drift the moment hashing changes.
 */
export async function seedDevAdmin(users: UsersService): Promise<SeedOutcome> {
  const logger = new Logger('SeedDevAdmin');
  const existing = await users.findByEmail(DEV_ADMIN.email);

  if (existing) {
    if (existing.role !== Role.ADMIN) {
      // Deliberately not promoted. A setup command must not hand out privileges as a side
      // effect of being run.
      logger.warn(
        `${DEV_ADMIN.email} exists without administrator rights. Sign-in will work, but admin-only routes will refuse it.`,
      );
      return 'exists-without-admin';
    }

    logger.log(`${DEV_ADMIN.email} already exists — nothing to do.`);
    return 'already-exists';
  }

  // The plain password is handed over as-is; UsersService.create hashes it.
  await users.create({
    email: DEV_ADMIN.email,
    name: DEV_ADMIN.name,
    password: DEV_ADMIN.password,
    role: Role.ADMIN,
  } as never);

  logger.log(
    `Created ${DEV_ADMIN.email}. Sign in with password: ${DEV_ADMIN.password}`,
  );
  return 'created';
}

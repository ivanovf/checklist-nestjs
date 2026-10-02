import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';

import { User } from './entities/user.entity';

/**
 * One-off repair for D17 (specs/009-fix-unprojected-records).
 *
 * While D17 was live, an account change with `changePassword: false` wrote the `password` it
 * carried, as plain text, over the hash, and the account could no longer sign in. This finds
 * every stored password that isn't a bcrypt hash and replaces it with the hash of the same
 * value, so the account signs in with that value again. The original password is gone; the
 * person can change it once signed in.
 *
 * The logic lives here, where jest discovers it. `scripts/repair-plain-passwords.ts` is a thin
 * runner. Nothing here logs: the runner prints `formatReport`, which names accounts by id only.
 */

/** Matches what `UsersService` stores. */
const SALT_ROUNDS = 10;

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function isBcryptHash(value: unknown): boolean {
  return typeof value === 'string' && BCRYPT_HASH.test(value);
}

export interface RepairResult {
  database: string;
  apply: boolean;
  scanned: number;
  /** Ids of accounts whose password is plain text. */
  toRepair: string[];
  repaired: number;
  /** Ids of accounts with no password at all: there is nothing to hash. */
  skippedNoPassword: string[];
}

export async function repairPlainTextPasswords(
  users: Model<User>,
  { apply }: { apply: boolean },
): Promise<RepairResult> {
  const result: RepairResult = {
    database: users.db.name,
    apply,
    scanned: 0,
    toRepair: [],
    repaired: 0,
    skippedNoPassword: [],
  };

  const accounts = users
    .find()
    .select({ _id: 1, password: 1 })
    .lean<{ _id: unknown; password?: unknown }>()
    .cursor();

  for await (const account of accounts) {
    result.scanned += 1;
    const id = String(account._id);
    const { password } = account;

    if (password === undefined || password === null) {
      result.skippedNoPassword.push(id);
      continue;
    }
    if (isBcryptHash(password)) continue;

    result.toRepair.push(id);
    if (!apply) continue;

    // Compare-and-set on the value just read: safe to run twice or after an interruption, and
    // it never overwrites a password changed in between.
    const { modifiedCount } = await users
      .updateOne(
        { _id: account._id, password },
        {
          $set: { password: await bcrypt.hash(String(password), SALT_ROUNDS) },
        },
      )
      .exec();
    result.repaired += modifiedCount;
  }

  return result;
}

/** Ids and counts only: no password, hash or email (constitution: personal data stays out of logs). */
export function formatReport(result: RepairResult): string {
  const lines = [
    `Database: ${result.database}`,
    `Mode: ${result.apply ? 'apply' : 'dry run (nothing written)'}`,
    `Accounts scanned: ${result.scanned}`,
    `Plain-text passwords: ${result.toRepair.length}`,
    ...result.toRepair.map((id) => `  ${id}`),
  ];

  if (result.apply) {
    lines.push(`Repaired: ${result.repaired}`);
  }

  lines.push(
    `Accounts with no password (skipped): ${result.skippedNoPassword.length}`,
    ...result.skippedNoPassword.map((id) => `  ${id}`),
  );

  return lines.join('\n');
}

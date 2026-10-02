import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { User } from '../../src/users/entities/user.entity';
import { Role } from '../../src/auth/models/role.model';

export interface SeededAccount {
  email: string;
  password: string;
  role: Role;
  id: string;
}

export const ADMIN_PASSWORD = 'admin-password';
export const GUEST_PASSWORD = 'guest-password';

/**
 * Seeds one administrator and one standard authenticated account.
 *
 * Every security suite needs all three caller types — anonymous, authenticated, admin — so the
 * authorization matrix can be exercised in full.
 */
let seedCounter = 0;
// The counter restarts in every test file, but the database is shared by the whole run, so the
// file's own tag keeps `admin1@…` from one file apart from another's. Without it, a file that
// seeded several times left accounts a later file's second seed collided with
// (specs/009-fix-unprojected-records).
const fileTag = randomBytes(4).toString('hex');

export async function seedAccounts(
  app: INestApplication,
): Promise<{ admin: SeededAccount; guest: SeededAccount }> {
  const userModel = app.get<Model<User>>(getModelToken(User.name));
  // Unique per call, across the whole run: a suite that seeds twice must get genuinely distinct
  // accounts, or sign-in resolves the first match and the token belongs to the wrong record.
  const n = `${fileTag}-${++seedCounter}`;

  const make = async (email: string, password: string, role: Role) => {
    const created = await userModel.create({
      email,
      name: role,
      role,
      password: await bcrypt.hash(password, 10),
    });

    return { email, password, role, id: String(created._id) };
  };

  return {
    admin: await make(`admin${n}@test.local`, ADMIN_PASSWORD, Role.ADMIN),
    guest: await make(
      `guest${n}@test.local`,
      GUEST_PASSWORD,
      Role.AUTHENTICATED,
    ),
  };
}

/** Signs in and returns the bearer token. */
export async function tokenFor(
  app: INestApplication,
  account: SeededAccount,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/login')
    .send({ email: account.email, password: account.password })
    .expect(201);

  return res.body.access_token;
}

/** Changes an account's stored role without reissuing its token — for the FR-005 check. */
export async function setRole(
  app: INestApplication,
  account: SeededAccount,
  role: Role,
): Promise<void> {
  const userModel = app.get<Model<User>>(getModelToken(User.name));
  await userModel.findByIdAndUpdate(account.id, { $set: { role } }).exec();
}

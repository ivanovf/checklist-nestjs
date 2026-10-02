import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import * as request from 'supertest';

import { User } from '../../src/users/entities/user.entity';
import {
  formatReport,
  repairPlainTextPasswords,
} from '../../src/users/password-repair';
import { createTestApp } from '../security/app-factory';

/**
 * The one-off repair for D17 (specs/009-fix-unprojected-records), against a real database.
 *
 * Accounts changed while D17 was live hold their password as plain text and can't sign in. The
 * repair hashes each such value in place, so the account signs in with it again, and leaves
 * real hashes alone.
 *
 * It runs against its own database on the shared in-memory server: other suites leave accounts
 * with deliberately fake hashes, which the repair would otherwise rewrite.
 */
describe('Plain-text password repair (009, D17)', () => {
  let app: INestApplication;
  let users: Model<User>;
  let sharedUri: string | undefined;

  const ids = {
    hashedA: new Types.ObjectId(),
    hashedB: new Types.ObjectId(),
    plainA: new Types.ObjectId(),
    plainB: new Types.ObjectId(),
    none: new Types.ObjectId(),
  };
  const account = (_id: Types.ObjectId, extra: object) => ({
    _id,
    email: `${String(_id)}@test.local`,
    name: 'n',
    role: 'authenticated',
    ...extra,
  });
  const raw = () => users.collection;
  const passwordOf = async (_id: Types.ObjectId) =>
    (await raw().findOne({ _id }))?.password;

  beforeAll(async () => {
    sharedUri = process.env.MONGO_URI;
    process.env.MONGO_URI = `${(sharedUri as string).replace(/\/?$/, '/')}password-repair`;
    app = await createTestApp({ transport: true });
    users = app.get<Model<User>>(getModelToken(User.name));

    await raw().deleteMany({});
    await raw().insertMany([
      account(ids.hashedA, { password: bcrypt.hashSync('hashed-a', 4) }),
      account(ids.hashedB, { password: bcrypt.hashSync('hashed-b', 4) }),
      account(ids.plainA, { password: 'plain-a' }),
      account(ids.plainB, { password: 'plain-b' }),
      account(ids.none, {}),
    ]);
  });

  afterAll(async () => {
    await app?.close();
    process.env.MONGO_URI = sharedUri;
  });

  it('a dry run reports the plain-text accounts and writes nothing', async () => {
    const before = await raw().find().toArray();

    const result = await repairPlainTextPasswords(users, { apply: false });

    expect(result.scanned).toBe(5);
    expect([...result.toRepair].sort()).toEqual(
      [String(ids.plainA), String(ids.plainB)].sort(),
    );
    expect(result.skippedNoPassword).toEqual([String(ids.none)]);
    expect(result.repaired).toBe(0);
    expect(await raw().find().toArray()).toEqual(before);
  });

  it('applying it hashes the plain-text passwords in place', async () => {
    const hashedBefore = await passwordOf(ids.hashedA);

    const result = await repairPlainTextPasswords(users, { apply: true });

    expect(result.repaired).toBe(2);
    expect(await bcrypt.compare('plain-a', await passwordOf(ids.plainA))).toBe(
      true,
    );
    expect(await bcrypt.compare('plain-b', await passwordOf(ids.plainB))).toBe(
      true,
    );
    expect(await passwordOf(ids.hashedA)).toBe(hashedBefore);
    expect(await passwordOf(ids.none)).toBeUndefined();
  });

  it('a repaired account signs in with the value it held', async () => {
    await request(app.getHttpServer())
      .post('/api/login')
      .send({ email: `${String(ids.plainA)}@test.local`, password: 'plain-a' })
      .expect(201);
  });

  it('running it again finds nothing left to repair', async () => {
    const result = await repairPlainTextPasswords(users, { apply: true });

    expect(result.toRepair).toEqual([]);
    expect(result.repaired).toBe(0);
  });

  // Constitution: personal data stays out of logs, and a password must never be printed.
  it('its report carries no password, hash or email', async () => {
    await raw().updateOne(
      { _id: ids.plainB },
      { $set: { password: 'plain-b' } },
    );
    const result = await repairPlainTextPasswords(users, { apply: false });

    const report = formatReport(result);

    expect(report).toContain(String(ids.plainB));
    expect(report).not.toContain('plain-b');
    expect(report).not.toContain(String(await passwordOf(ids.hashedA)));
    expect(report).not.toContain('@test.local');
  });
});

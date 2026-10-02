import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import * as request from 'supertest';

import { createTestApp } from '../security/app-factory';
import { seedAccounts, tokenFor } from '../support/auth-fixtures';

/**
 * What an account change writes to the stored password (specs/009-fix-unprojected-records, D17).
 *
 * Regression suite for D17. An account change must carry every field, `password` included
 * (D9 / #14). With `changePassword: false` that value was still written, as plain text, over
 * the hash. Observed 2026-10-01: afterwards sign-in refused both the previous password and the
 * value sent, so the account was locked out.
 *
 * Sign-in allows five attempts a minute, counted per app, so the tests are split over two apps,
 * each staying within the limit. Booting one is slow on a mounted Windows drive, hence the
 * longer timeout for this file's hooks.
 */
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

jest.setTimeout(120_000);

describe('Account password writes (009, D17)', () => {
  let app: INestApplication;
  let token: string;
  let created = 0;
  let email: string;
  let id: string;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const signIn = (password: string) =>
    http().post('/api/login').send({ email, password });
  const stored = async () =>
    app
      .get<Connection>(getConnectionToken())
      .collection('users')
      .findOne({ _id: new Types.ObjectId(id) });
  const change = (body: object) =>
    http()
      .put(`/api/users/${id}`)
      .set(auth())
      .send({ email, name: 'n2', role: 'authenticated', ...body });

  const boot = async () => {
    app = await createTestApp({ transport: true });
    const { admin } = await seedAccounts(app);
    token = await tokenFor(app, admin);
  };

  // A fresh account for every test; creating one doesn't sign in.
  beforeEach(async () => {
    email = `d17-${++created}@test.local`;
    const res = await http()
      .post('/api/users')
      .set(auth())
      .send({ email, password: 'orig-pw', name: 'n', role: 'authenticated' })
      .expect(201);
    id = res.body._id;
  });

  // Sign-ins: one for the token, then two, then one.
  describe('without a verified password change', () => {
    beforeAll(boot);
    afterAll(async () => {
      await app?.close();
    });

    it('stores a hash when the account is created', async () => {
      expect((await stored())?.password).toMatch(BCRYPT);
    });

    it('a change without a password change leaves the password alone', async () => {
      await change({
        password: 'sent-pw',
        changePassword: false,
        currentPassword: 'whatever',
      }).expect(200);

      const record = await stored();
      expect(record?.name).toBe('n2');
      expect(record?.password).toMatch(BCRYPT);
      expect(record).not.toHaveProperty('currentPassword');
      expect(record).not.toHaveProperty('changePassword');

      await signIn('orig-pw').expect(201);
      await signIn('sent-pw').expect(401);
    });

    // The 406 itself is D16, unchanged here. What matters is that a refused change writes nothing.
    it('a refused password change changes nothing', async () => {
      await change({
        password: 'new-pw',
        changePassword: true,
        currentPassword: 'wrong',
      }).expect(406);

      expect((await stored())?.name).toBe('n');
      await signIn('orig-pw').expect(201);
    });
  });

  // Sign-ins: one for the token, then two.
  describe('with a verified password change', () => {
    beforeAll(boot);
    afterAll(async () => {
      await app?.close();
    });

    it('a verified password change stores the new password as a hash', async () => {
      await change({
        password: 'new-pw',
        changePassword: true,
        currentPassword: 'orig-pw',
      }).expect(200);

      expect((await stored())?.password).toMatch(BCRYPT);
      await signIn('new-pw').expect(201);
      await signIn('orig-pw').expect(401);
    });
  });
});

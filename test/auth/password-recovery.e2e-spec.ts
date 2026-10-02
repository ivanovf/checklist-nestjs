import { INestApplication, Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import * as request from 'supertest';

import { PasswordRecovery } from '../../src/auth/entities/password-recovery.entity';
import { Role } from '../../src/auth/models/role.model';
import { User } from '../../src/users/entities/user.entity';
import { createTestApp } from '../security/app-factory';
import {
  GUEST_PASSWORD,
  SeededAccount,
  seedAccounts,
  tokenFor,
} from '../support/auth-fixtures';

/**
 * Password recovery (specs/012-password-recovery).
 *
 * An administrator issues a one-time code for an account; the holder sets a new password with
 * it on a public route (contracts/password-recovery.md). Every state change is a single atomic
 * operation guarded by expiry and an attempt count (research R4), the per-source throttle is
 * defence in depth only (R5), and sessions issued before a recovery are refused (R6).
 *
 * Every completion in this suite comes from one source address, and the completion route
 * allows five a minute. The in-memory throttle store is therefore cleared before each test,
 * and between requests where one test needs more than five; only the throttling test itself
 * runs against an intact store.
 */
describe('Password recovery (012)', () => {
  let app: INestApplication;
  let users: Model<User>;
  let recoveries: Model<PasswordRecovery>;
  let admin: SeededAccount;
  let guest: SeededAccount;
  let adminToken: string;
  let guestToken: string;
  let accountCounter = 0;

  const clearThrottle = () =>
    (app.get(ThrottlerStorage) as ThrottlerStorageService).storage.clear();

  /** `null` sends no token; leaving it out sends the administrator's. */
  const issue = (userId: string, token: string | null = adminToken) => {
    const req = request(app.getHttpServer()).post(
      `/api/password-recovery/${userId}/code`,
    );
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const complete = (body: object) =>
    request(app.getHttpServer())
      .post('/api/password-recovery/complete')
      .send(body);

  const signIn = (email: string, password: string) =>
    request(app.getHttpServer()).post('/api/login').send({ email, password });

  /** A new guest per test, so no test inherits another's password or outstanding code. */
  const freshGuest = async (): Promise<SeededAccount> => {
    const n = ++accountCounter;
    const email = `recovery-guest${n}@test.local`;
    const created = await users.create({
      email,
      name: `recovery guest ${n}`,
      role: Role.AUTHENTICATED,
      password: await bcrypt.hash(GUEST_PASSWORD, 10),
    });

    return {
      email,
      password: GUEST_PASSWORD,
      role: Role.AUTHENTICATED,
      id: String(created._id),
    };
  };

  beforeAll(async () => {
    app = await createTestApp({ transport: true });
    users = app.get<Model<User>>(getModelToken(User.name));
    recoveries = app.get<Model<PasswordRecovery>>(
      getModelToken(PasswordRecovery.name),
    );

    ({ admin, guest } = await seedAccounts(app));
    adminToken = await tokenFor(app, admin);
    guestToken = await tokenFor(app, guest);
  });

  beforeEach(async () => {
    clearThrottle();
    await recoveries.deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
  });

  const REFUSAL = {
    statusCode: 400,
    message: 'The recovery code is invalid or has expired.',
    error: 'Bad Request',
  };
  const NEW_PASSWORD = 'a new passphrase';

  describe('US1: an administrator issues a code and the user resets with it', () => {
    it('issues a 6-digit code, once, for an hour, and stores only a fingerprint of it', async () => {
      const account = await freshGuest();

      const res = await issue(account.id).expect(201);

      expect(res.body.code).toMatch(/^\d{6}$/);
      const minutesLeft =
        (new Date(res.body.expiresAt).getTime() - Date.now()) / 60_000;
      expect(minutesLeft).toBeGreaterThan(59);
      expect(minutesLeft).toBeLessThanOrEqual(60);
      expect(res.headers['cache-control']).toContain('no-store');

      const stored = await recoveries.find({}).lean().exec();
      expect(stored).toHaveLength(1);
      expect(String(stored[0].userId)).toBe(account.id);
      expect(stored[0].codeHash).not.toContain(res.body.code);
    });

    it('sets the new password, without signing the user in', async () => {
      const account = await freshGuest();
      const { code } = (await issue(account.id).expect(201)).body;

      const res = await complete({
        email: account.email,
        code,
        newPassword: NEW_PASSWORD,
      }).expect(200);

      expect(res.body).toEqual({ passwordReset: true });
      await signIn(account.email, NEW_PASSWORD).expect(201);
      await signIn(account.email, GUEST_PASSWORD).expect(401);
    });

    it('refuses the same code a second time', async () => {
      const account = await freshGuest();
      const { code } = (await issue(account.id).expect(201)).body;
      const body = { email: account.email, code, newPassword: NEW_PASSWORD };
      await complete(body).expect(200);

      const again = await complete(body).expect(400);

      expect(again.body).toEqual(REFUSAL);
      expect(await recoveries.countDocuments({ userId: account.id })).toBe(0);
    });

    it('voids the earlier code when a new one is issued', async () => {
      const account = await freshGuest();
      const first = (await issue(account.id).expect(201)).body.code;
      const second = (await issue(account.id).expect(201)).body.code;
      const attempt = (code: string) =>
        complete({ email: account.email, code, newPassword: NEW_PASSWORD });

      // Equal codes are a one-in-a-million coincidence; the first would then still work.
      if (first !== second) {
        expect((await attempt(first).expect(400)).body).toEqual(REFUSAL);
      }
      await attempt(second).expect(200);
    });

    it('refuses to issue for an account that does not exist, or a malformed id', async () => {
      const missing = new Types.ObjectId().toHexString();

      const res = await issue(missing).expect(404);

      expect(res.body.message).toBe(`user #${missing} not found`);
      await issue('not-an-id').expect(400);
    });

    it('keeps one code when two are issued at once', async () => {
      const account = await freshGuest();

      const responses = await Promise.all([
        issue(account.id),
        issue(account.id),
      ]);

      // Research R4: an upsert that hits the unique userId index is retried by MongoDB. A 500
      // here means it was not, and must be investigated rather than papered over.
      expect(responses.map((r) => r.status)).toEqual([201, 201]);
      expect(await recoveries.countDocuments({ userId: account.id })).toBe(1);

      const attempt = (code: string) =>
        complete({ email: account.email, code, newPassword: NEW_PASSWORD });
      const [a, b] = responses.map((r) => r.body.code as string);
      const firstTry = await attempt(a);
      if (firstTry.status !== 200) {
        await attempt(b).expect(200);
      }
    });
  });

  /** A code that is certainly not `code`. */
  const wrongFor = (code: string) => (code === '000000' ? '000001' : '000000');

  const storedAttempts = async (userId: string) =>
    (await recoveries.findOne({ userId }).lean().exec())?.attempts;

  describe('US2: who may issue', () => {
    it('refuses a signed-in account that is not an administrator, even for itself', async () => {
      await issue(guest.id, guestToken).expect(403);
      expect(await recoveries.countDocuments({})).toBe(0);
    });

    it('refuses an anonymous caller', async () => {
      await issue(guest.id, null).expect(401);
      expect(await recoveries.countDocuments({})).toBe(0);
    });
  });

  describe('US2: identical refusals (SC-004)', () => {
    it('answers every account or code failure with the same status and body', async () => {
      const responses: { status: number; body: unknown }[] = [];
      const record = async (body: object) => {
        clearThrottle();
        const res = await complete(body);
        responses.push({ status: res.status, body: res.body });
      };
      const attempt = (account: SeededAccount, code: string) =>
        record({ email: account.email, code, newPassword: NEW_PASSWORD });
      const issued = async (account: SeededAccount) =>
        (await issue(account.id).expect(201)).body.code as string;

      // (a) unknown email
      await record({
        email: 'nobody@test.local',
        code: '123456',
        newPassword: NEW_PASSWORD,
      });

      // (b) a real account with no outstanding code
      await attempt(await freshGuest(), '123456');

      // (c) a wrong code
      const wrong = await freshGuest();
      await attempt(wrong, wrongFor(await issued(wrong)));

      // (d) an expired code
      const expired = await freshGuest();
      const expiredCode = await issued(expired);
      await recoveries
        .updateOne(
          { userId: expired.id },
          { $set: { expiresAt: new Date(Date.now() - 1000) } },
        )
        .exec();
      await attempt(expired, expiredCode);

      // (e) a used code
      const used = await freshGuest();
      const usedCode = await issued(used);
      clearThrottle();
      await complete({
        email: used.email,
        code: usedCode,
        newPassword: NEW_PASSWORD,
      }).expect(200);
      await attempt(used, usedCode);

      // (f) a code whose account was deleted after it was issued
      const deleted = await freshGuest();
      const deletedCode = await issued(deleted);
      await users.deleteOne({ _id: deleted.id }).exec();
      await attempt(deleted, deletedCode);

      // (g) a valid code with the email in another letter case: matched as sign-in matches it
      const upper = await freshGuest();
      const upperCode = await issued(upper);
      await record({
        email: upper.email.toUpperCase(),
        code: upperCode,
        newPassword: NEW_PASSWORD,
      });
      await signIn(upper.email.toUpperCase(), GUEST_PASSWORD).expect(401);

      expect(responses).toHaveLength(7);
      for (const response of responses) {
        expect(response).toEqual({ status: 400, body: REFUSAL });
      }
    });
  });

  describe('US2: attempt limit (FR-008)', () => {
    const tryCode = (account: SeededAccount, code: string) => {
      clearThrottle();
      return complete({
        email: account.email,
        code,
        newPassword: NEW_PASSWORD,
      });
    };

    it('voids the code after five wrong attempts, even for the right code', async () => {
      const account = await freshGuest();
      const { code } = (await issue(account.id).expect(201)).body;

      for (let i = 0; i < 5; i += 1) {
        await tryCode(account, wrongFor(code)).expect(400);
      }
      const last = await tryCode(account, code).expect(400);

      expect(last.body).toEqual(REFUSAL);
      expect(await storedAttempts(account.id)).toBe(5);
      await signIn(account.email, GUEST_PASSWORD).expect(201);
    });

    it('still accepts the right code after four wrong attempts', async () => {
      const account = await freshGuest();
      const { code } = (await issue(account.id).expect(201)).body;

      for (let i = 0; i < 4; i += 1) {
        await tryCode(account, wrongFor(code)).expect(400);
      }

      await tryCode(account, code).expect(200);
    });

    it('starts the count again when a new code is issued', async () => {
      const account = await freshGuest();
      const first = (await issue(account.id).expect(201)).body.code;
      for (let i = 0; i < 5; i += 1) {
        await tryCode(account, wrongFor(first)).expect(400);
      }

      const second = (await issue(account.id).expect(201)).body.code;

      await tryCode(account, second).expect(200);
    });
  });

  describe('US2: input validation (FR-010, R9)', () => {
    it.each([
      ['a 7-character password', { newPassword: 'short12' }, 'newPassword'],
      ['a 73-byte password', { newPassword: 'a'.repeat(73) }, 'newPassword'],
      [
        'a 37-character, 74-byte password',
        { newPassword: 'é'.repeat(37) },
        'newPassword',
      ],
      ['a 5-digit code', { code: '12345' }, 'code'],
      ['a 7-digit code', { code: '1234567' }, 'code'],
      ['a code with a letter', { code: '12a456' }, 'code'],
      ['an unknown field', { role: 'admin' }, 'role'],
      ['a missing email', { email: undefined }, 'email'],
    ])(
      'refuses %s without consuming the code or counting an attempt',
      async (_case, override, field) => {
        const account = await freshGuest();
        const { code } = (await issue(account.id).expect(201)).body;
        const valid = {
          email: account.email,
          code,
          newPassword: NEW_PASSWORD,
        };

        const res = await complete({ ...valid, ...override }).expect(400);

        expect(JSON.stringify(res.body.message)).toContain(field);
        expect(await storedAttempts(account.id)).toBe(0);
        await complete(valid).expect(200);
      },
    );

    it('counts bytes, not characters: 25 two-byte characters are accepted', async () => {
      const account = await freshGuest();
      const { code } = (await issue(account.id).expect(201)).body;

      await complete({
        email: account.email,
        code,
        newPassword: 'é'.repeat(25),
      }).expect(200);
    });

    it('accepts the current password as the new one', async () => {
      const account = await freshGuest();
      const { code } = (await issue(account.id).expect(201)).body;

      await complete({
        email: account.email,
        code,
        newPassword: GUEST_PASSWORD,
      }).expect(200);
      await signIn(account.email, GUEST_PASSWORD).expect(201);
    });
  });

  describe('US2: concurrent and signed-in completion', () => {
    it('lets exactly one of two simultaneous completions with one code through', async () => {
      const account = await freshGuest();
      const { code } = (await issue(account.id).expect(201)).body;
      const body = { email: account.email, code, newPassword: NEW_PASSWORD };

      const results = await Promise.all([complete(body), complete(body)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    });

    it('ignores a bearer token sent with a completion', async () => {
      const account = await freshGuest();
      const { code } = (await issue(account.id).expect(201)).body;

      await request(app.getHttpServer())
        .post('/api/password-recovery/complete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: account.email, code, newPassword: NEW_PASSWORD })
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/login/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  /**
   * Failed attempts must count: a limiter that only counted successes would protect nothing
   * (compare test/security/auth-throttle.e2e-spec.ts). This limit is per instance and in
   * memory, defence in depth only; the guessing bound is the attempt counter (research R5).
   */
  describe('US2: throttling (FR-009)', () => {
    it('refuses completions beyond five a minute from one source', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 7; i += 1) {
        const res = await complete({
          email: 'nobody@test.local',
          code: '123456',
          newPassword: NEW_PASSWORD,
        });
        statuses.push(res.status);
      }

      expect(statuses).toEqual([400, 400, 400, 400, 400, 429, 429]);
    });
  });

  describe('US2: no secrets in logs (FR-014, SC-008)', () => {
    it('logs every outcome by account id, never the code, password or email', async () => {
      const account = await freshGuest();
      // Two channels. Whatever reaches the console passes through these streams; but the
      // testing module's logger prints errors only, so the logger's calls are captured too,
      // which is what a deployed instance would print.
      const chunks: string[] = [];
      const loggerSpies = (
        ['log', 'warn', 'error', 'debug', 'verbose'] as const
      ).map((level) =>
        jest
          .spyOn(Logger.prototype, level)
          .mockImplementation((...args: unknown[]) => {
            chunks.push(args.map(String).join(' '));
          }),
      );
      const capture = (stream: NodeJS.WriteStream) => {
        const original = stream.write;
        stream.write = ((chunk: unknown, ...rest: unknown[]) => {
          chunks.push(String(chunk));
          return (original as (...args: unknown[]) => boolean).apply(stream, [
            chunk,
            ...rest,
          ]);
        }) as typeof stream.write;
        return { mockRestore: () => (stream.write = original) };
      };
      const spies = [capture(process.stdout), capture(process.stderr)];

      let code: string;
      try {
        code = (await issue(account.id).expect(201)).body.code;
        await complete({
          email: account.email,
          code: wrongFor(code),
          newPassword: NEW_PASSWORD,
        }).expect(400);
        await complete({
          email: account.email,
          code,
          newPassword: 'short',
        }).expect(400);
        await complete({
          email: account.email,
          code,
          newPassword: NEW_PASSWORD,
        }).expect(200);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
        loggerSpies.forEach((spy) => spy.mockRestore());
      }

      const log = chunks.join('');
      for (const secret of [
        code,
        NEW_PASSWORD,
        GUEST_PASSWORD,
        account.email,
      ]) {
        expect(log).not.toContain(secret);
      }
      for (const event of [
        'password_recovery.issued',
        'password_recovery.refused',
        'password_recovery.completed',
      ]) {
        const line = chunks.find((c) => c.includes(event));
        expect(line).toBeDefined();
        expect(line).toContain(account.id);
      }
    });
  });

  /**
   * FR-013, research R6. A token's issue time is in whole seconds and a token from the same
   * second as the recovery is accepted, so the old session is opened, then the clock is let
   * cross into the next second before recovering: the old token is then strictly earlier.
   */
  describe('US3: sessions opened before the reset stop working', () => {
    const nextSecond = async () => {
      const start = Math.floor(Date.now() / 1000);
      while (Math.floor(Date.now() / 1000) === start) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    const get = (path: string, token: string) =>
      request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`);

    it('refuses a session from before the recovery and accepts one from after', async () => {
      const account = await freshGuest();
      const old = await tokenFor(app, account);
      await nextSecond();

      const { code } = (await issue(account.id).expect(201)).body;
      await complete({
        email: account.email,
        code,
        newPassword: NEW_PASSWORD,
      }).expect(200);

      await get('/api/login/validate', old).expect(401);
      await get(`/api/users/${account.id}`, old).expect(401);

      const fresh = (await signIn(account.email, NEW_PASSWORD).expect(201)).body
        .access_token;
      await get('/api/login/validate', fresh).expect(200);
      await get(`/api/users/${account.id}`, fresh).expect(200);
    });

    it('leaves every other session alone', async () => {
      const bystander = await freshGuest();
      const bystanderToken = await tokenFor(app, bystander);
      const account = await freshGuest();
      await nextSecond();

      const { code } = (await issue(account.id).expect(201)).body;
      await complete({
        email: account.email,
        code,
        newPassword: NEW_PASSWORD,
      }).expect(200);

      await get('/api/login/validate', bystanderToken).expect(200);
      await get('/api/login/validate', adminToken).expect(200);
    });
  });

  /**
   * Research R13. `passwordChangedAt` decides which sessions survive a recovery, so only a
   * completed recovery may write it. A client able to set it could date a password change into
   * the future and lock that account out of every session, fresh sign-ins included.
   */
  describe('R13: only recovery sets passwordChangedAt', () => {
    const future = '2099-01-01T00:00:00.000Z';

    const storedChangedAt = async (id: string) =>
      (await users.findById(id).select('+passwordChangedAt').lean().exec())
        ?.passwordChangedAt;

    // Since specs/010-fix-unknown-fields the request rules refuse the undeclared field outright
    // (400), which is stronger than storing nothing. The service also drops it on its own
    // (src/users/users.service.spec.ts), so neither layer depends on the other.
    it('refuses it on an account update', async () => {
      const account = await freshGuest();
      const accountToken = await tokenFor(app, account);

      // Every field is required (D9).
      await request(app.getHttpServer())
        .put(`/api/users/${account.id}`)
        .set('Authorization', `Bearer ${accountToken}`)
        .send({
          email: account.email,
          password: 'unused',
          name: 'account',
          role: Role.AUTHENTICATED,
          changePassword: false,
          currentPassword: 'unused',
          passwordChangedAt: future,
        })
        .expect(400);

      expect(await storedChangedAt(account.id)).toBeUndefined();
      await request(app.getHttpServer())
        .get('/api/login/validate')
        .set('Authorization', `Bearer ${accountToken}`)
        .expect(200);
    });

    it('refuses it when an administrator creates an account', async () => {
      const email = `r13-created-${Date.now()}@test.local`;

      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          password: 'a password',
          name: 'created',
          role: Role.AUTHENTICATED,
          passwordChangedAt: future,
        })
        .expect(400);

      expect(await users.countDocuments({ email }).exec()).toBe(0);
    });
  });
});

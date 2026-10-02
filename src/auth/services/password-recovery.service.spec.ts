import * as crypto from 'crypto';
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';

import {
  PasswordRecoveryService,
  RECOVERY_REFUSED,
} from './password-recovery.service';
import { PasswordRecovery } from '../entities/password-recovery.entity';
import { UsersService } from '../../users/users.service';

/**
 * Issuing and completing a password recovery (specs/012-password-recovery). The model is a
 * stub: what matters here is the filter and update each step sends, because the guarantees
 * (single use, expiry, the attempt limit) live in those atomic operations (research R4). The
 * e2e suite proves them against a real MongoDB.
 */
describe('PasswordRecoveryService', () => {
  const USER_ID = '6aba80d38c58c96b58020001';
  const ADMIN_ID = '6aba80d38c58c96b58020002';

  let service: PasswordRecoveryService;
  let users: Record<'findById' | 'findByEmail' | 'resetPassword', jest.Mock>;
  let model: Record<
    'updateOne' | 'findOneAndDelete' | 'findOneAndUpdate',
    jest.Mock
  >;

  const resolves = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });

  beforeEach(async () => {
    users = {
      findById: jest.fn().mockResolvedValue({ _id: USER_ID }),
      findByEmail: jest.fn().mockResolvedValue({ _id: USER_ID }),
      resetPassword: jest.fn().mockResolvedValue(true),
    };
    model = {
      updateOne: jest.fn().mockReturnValue(resolves({ acknowledged: true })),
      findOneAndDelete: jest.fn().mockReturnValue(resolves(null)),
      findOneAndUpdate: jest.fn().mockReturnValue(resolves(null)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PasswordRecoveryService,
        { provide: UsersService, useValue: users },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('s'.repeat(32)) },
        },
        { provide: getModelToken(PasswordRecovery.name), useValue: model },
      ],
    }).compile();

    service = moduleRef.get(PasswordRecoveryService);
  });

  afterEach(() => jest.restoreAllMocks());

  /** The fingerprint `issue` stored for its most recent code. */
  const storedHash = () => model.updateOne.mock.calls.at(-1)?.[1].$set.codeHash;

  const fixCode = (value: number) =>
    (jest.spyOn(crypto, 'randomInt') as unknown as jest.Mock).mockReturnValue(
      value,
    );

  describe('issue', () => {
    it('refuses an account that does not exist, and stores nothing', async () => {
      users.findById.mockResolvedValue(null);

      await expect(service.issue(USER_ID, ADMIN_ID)).rejects.toThrow(
        new NotFoundException(`user #${USER_ID} not found`),
      );
      expect(model.updateOne).not.toHaveBeenCalled();
    });

    it('replaces any earlier code with a fresh one that lasts an hour', async () => {
      const result = await service.issue(USER_ID, ADMIN_ID);

      const [filter, update, options] = model.updateOne.mock.calls[0];
      expect(filter).toEqual({ userId: USER_ID });
      expect(options).toEqual({ upsert: true });

      const set = update.$set;
      expect(set.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(set.issuedBy).toBe(ADMIN_ID);
      expect(set.attempts).toBe(0);
      expect(set.expiresAt.getTime() - set.issuedAt.getTime()).toBe(3_600_000);

      expect(result.code).toMatch(/^\d{6}$/);
      expect(result.expiresAt).toEqual(set.expiresAt);
      expect(set.codeHash).not.toContain(result.code);
    });

    it('keeps leading zeros', async () => {
      fixCode(42);

      const { code } = await service.issue(USER_ID, ADMIN_ID);

      expect(code).toBe('000042');
    });

    it('binds the account into the fingerprint', async () => {
      fixCode(123456);

      await service.issue(USER_ID, ADMIN_ID);
      const first = storedHash();
      users.findById.mockResolvedValue({ _id: ADMIN_ID });
      await service.issue(ADMIN_ID, ADMIN_ID);

      expect(storedHash()).not.toBe(first);
    });
  });

  describe('complete', () => {
    const body = (code: string) => ({
      email: 'guest@test.local',
      code,
      newPassword: 'a new passphrase',
    });

    it('consumes the code and sets the new password', async () => {
      const { code } = await service.issue(USER_ID, ADMIN_ID);
      model.findOneAndDelete.mockReturnValue(resolves({ userId: USER_ID }));

      const result = await service.complete(body(code));

      expect(result).toEqual({ passwordReset: true });
      const [filter] = model.findOneAndDelete.mock.calls[0];
      expect(filter).toMatchObject({ userId: USER_ID, codeHash: storedHash() });
      expect(users.resetPassword).toHaveBeenCalledWith(
        USER_ID,
        'a new passphrase',
      );
    });
  });

  describe('complete refusals', () => {
    const body = {
      email: 'guest@test.local',
      code: '123456',
      newPassword: 'a new passphrase',
    };
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    /** The one refusal event a completion logged, parsed. */
    const refusal = () => {
      expect(warn).toHaveBeenCalledTimes(1);
      return JSON.parse(warn.mock.calls[0][0]);
    };

    const refused = () =>
      expect(service.complete(body)).rejects.toThrow(
        new BadRequestException(RECOVERY_REFUSED),
      );

    it('refuses an unknown email without touching any code', async () => {
      users.findByEmail.mockResolvedValue(null);

      await refused();

      expect(model.findOneAndDelete).not.toHaveBeenCalled();
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
      expect(refusal()).toMatchObject({
        event: 'password_recovery.refused',
        account: 'unknown',
        reason: 'unknown_account',
      });
    });

    it('only consumes a code that is unexpired and has attempts left', async () => {
      await refused();

      const [filter] = model.findOneAndDelete.mock.calls[0];
      expect(filter.expiresAt.$gt).toBeInstanceOf(Date);
      expect(filter.attempts).toEqual({ $lt: 5 });
    });

    it('counts a wrong code against the outstanding one', async () => {
      model.findOneAndUpdate.mockReturnValue(resolves({ attempts: 2 }));

      await refused();

      const [filter, update, options] = model.findOneAndUpdate.mock.calls[0];
      expect(filter).toMatchObject({ userId: USER_ID, attempts: { $lt: 5 } });
      expect(filter.expiresAt.$gt).toBeInstanceOf(Date);
      expect(update).toEqual({ $inc: { attempts: 1 } });
      expect(options).toEqual({ new: true });
      expect(refusal()).toMatchObject({
        account: USER_ID,
        reason: 'wrong_code',
      });
    });

    it('names the fifth wrong code as the one that voids it', async () => {
      model.findOneAndUpdate.mockReturnValue(resolves({ attempts: 5 }));

      await refused();

      expect(refusal().reason).toBe('attempts_exhausted');
    });

    it('names a missing, expired or already voided code', async () => {
      await refused();

      expect(refusal().reason).toBe('no_outstanding_code');
    });

    it('refuses when the account was deleted after the code was issued', async () => {
      model.findOneAndDelete.mockReturnValue(resolves({ userId: USER_ID }));
      users.resetPassword.mockResolvedValue(false);

      await refused();

      expect(refusal().reason).toBe('account_gone');
    });

    it('never logs the code, the password or the email', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const { code } = await service.issue(USER_ID, ADMIN_ID);
      model.findOneAndDelete.mockReturnValue(resolves({ userId: USER_ID }));
      await service.complete({ ...body, code });
      model.findOneAndDelete.mockReturnValue(resolves(null));
      await refused();

      const logged = JSON.stringify([...log.mock.calls, ...warn.mock.calls]);
      for (const secret of [code, body.newPassword, body.email]) {
        expect(logged).not.toContain(secret);
      }
    });
  });

  describe('security events', () => {
    it('records who issued a code for which account', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await service.issue(USER_ID, ADMIN_ID);

      expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
        event: 'password_recovery.issued',
        account: USER_ID,
        issuedBy: ADMIN_ID,
      });
    });

    it('records a completed recovery', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      model.findOneAndDelete.mockReturnValue(resolves({ userId: USER_ID }));

      await service.complete({
        email: 'guest@test.local',
        code: '123456',
        newPassword: 'a new passphrase',
      });

      expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
        event: 'password_recovery.completed',
        account: USER_ID,
      });
    });
  });
});

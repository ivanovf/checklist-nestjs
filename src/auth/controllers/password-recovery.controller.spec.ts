import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { Request } from 'express';

import { PasswordRecoveryController } from './password-recovery.controller';
import { PasswordRecoveryService } from '../services/password-recovery.service';
import { Role } from '../models/role.model';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { paramPipes, routeOf } from '../../common/testing/route-metadata';

/**
 * The two recovery routes (specs/012-password-recovery, contracts/password-recovery.md).
 * Enforcement of the declarations read here is proven end to end by the authorization matrix
 * and the recovery e2e suite.
 */
describe('PasswordRecoveryController', () => {
  let controller: PasswordRecoveryController;
  let service: Record<'issue' | 'complete', jest.Mock>;

  beforeEach(async () => {
    service = {
      issue: jest
        .fn()
        .mockResolvedValue({ code: '042917', expiresAt: 'later' }),
      complete: jest.fn().mockResolvedValue({ passwordReset: true }),
    };

    const moduleRef = await Test.createTestingModule({
      // `complete` declares ThrottlerGuard, whose options provider must exist at init.
      imports: [
        ThrottlerModule.forRoot([
          { name: 'default', ttl: seconds(60), limit: 20 },
        ]),
      ],
      controllers: [PasswordRecoveryController],
      providers: [{ provide: PasswordRecoveryService, useValue: service }],
    }).compile();

    controller = moduleRef.get(PasswordRecoveryController);
  });

  describe('issue', () => {
    const handler = PasswordRecoveryController.prototype.issue;

    it('is an administrator-only POST on the account', () => {
      expect(routeOf(PasswordRecoveryController, 'issue')).toEqual({
        method: 'POST',
        path: '/password-recovery/:userId/code',
        roles: [Role.ADMIN],
        isPublic: false,
      });
    });

    it('checks the id before it reaches the service', () => {
      expect(
        paramPipes(PasswordRecoveryController, 'issue', 'userId'),
      ).toContain(ParseObjectIdPipe);
    });

    it('forbids caching, because the response carries a live code', () => {
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
        name: 'Cache-Control',
        value: 'no-store',
      });
    });

    it('records the signed-in administrator as the issuer', async () => {
      const req = { user: { id: 'admin-1' } } as unknown as Request;

      await controller.issue('user-1', req);

      expect(service.issue).toHaveBeenCalledWith('user-1', 'admin-1');
    });
  });

  describe('complete', () => {
    const handler = PasswordRecoveryController.prototype.complete;

    it('is a public POST answering 200, since it creates nothing', () => {
      expect(routeOf(PasswordRecoveryController, 'complete')).toEqual({
        method: 'POST',
        path: '/password-recovery/complete',
        roles: undefined,
        isPublic: true,
      });
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    });

    /**
     * Defence in depth, per instance and in memory (research O1/R5); the guessing bound is the
     * persisted attempt counter. Failed attempts must count, so the throttle is a route guard.
     */
    it('is throttled to five requests a minute per source', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        ThrottlerGuard,
      );
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(5);
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(
        seconds(60),
      );
    });

    it('passes the body to the service', async () => {
      const dto = {
        email: 'guest@test.local',
        code: '042917',
        newPassword: 'a new passphrase',
      };

      await expect(controller.complete(dto)).resolves.toEqual({
        passwordReset: true,
      });
      expect(service.complete).toHaveBeenCalledWith(dto);
    });
  });
});

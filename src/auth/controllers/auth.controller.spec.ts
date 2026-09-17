import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';
import { User } from '../../users/entities/user.entity';

/**
 * `validate` parses the Authorization header by hand rather than going through the JWT guard,
 * so every rejection path it owns is covered here: a missing header, a header that is not a
 * Bearer credential, and a token the service refuses. Each must answer 401 and nothing else —
 * leaking the underlying verification error would tell a caller why a token was rejected.
 */
describe('AuthController', () => {
  let controller: AuthController;
  let auth: Record<string, jest.Mock>;

  beforeEach(async () => {
    auth = {
      generateJWT: jest.fn().mockReturnValue({
        access_token: 'signed.jwt.token',
        user: { email: 'guest@example.com' },
      }),
      validateToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      // The login route declares ThrottlerGuard, and Nest resolves route guards at module
      // initialisation, so the throttler's options provider has to exist here even though
      // these tests call the controller methods directly.
      imports: [
        ThrottlerModule.forRoot([
          { name: 'default', ttl: seconds(60), limit: 20 },
        ]),
      ],
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login', () => {
    it('issues a token for the account the local strategy resolved', () => {
      const user = { email: 'guest@example.com' } as User;

      const result = controller.login({ user } as unknown as Request);

      expect(auth.generateJWT).toHaveBeenCalledWith(user);
      expect(result).toMatchObject({ access_token: 'signed.jwt.token' });
    });
  });

  describe('validateToken', () => {
    it('refuses a request with no Authorization header', async () => {
      await expect(controller.validateToken(undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(auth.validateToken).not.toHaveBeenCalled();
    });

    it('refuses a header that is not a Bearer credential', async () => {
      await expect(
        controller.validateToken('Basic dXNlcjpwYXNz'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auth.validateToken).not.toHaveBeenCalled();
    });

    it('passes the bare token, without the scheme, to the service', async () => {
      auth.validateToken.mockResolvedValue({ email: 'guest@example.com' });

      const result = await controller.validateToken('Bearer a.b.c');

      expect(auth.validateToken).toHaveBeenCalledWith('a.b.c');
      expect(result).toEqual({
        access: true,
        user: { email: 'guest@example.com' },
      });
    });

    it('answers 401 without disclosing why verification failed', async () => {
      auth.validateToken.mockRejectedValue(new Error('jwt expired'));

      await expect(controller.validateToken('Bearer expired')).rejects.toThrow(
        'Invalid token',
      );
    });
  });
});

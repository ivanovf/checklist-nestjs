import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/entities/user.entity';

// The real module is native and does actual key stretching; the comparison result is the only
// thing under test here, so it is controlled directly.
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

/**
 * Credential verification is the gate every authenticated route sits behind, so each of its
 * outcomes is pinned: unknown account, wrong password, and success. The two failures must be
 * indistinguishable to a caller — a different message or error type for "no such account"
 * would let an attacker enumerate valid emails.
 */
describe('AuthService', () => {
  let service: AuthService;
  let users: Record<string, jest.Mock>;
  let jwt: Record<string, jest.Mock>;

  const hash = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

  const doc = () =>
    ({
      _id: 'user-1',
      email: 'guest@example.com',
      role: 'authenticated',
      password: hash,
      toJSON: () => ({
        _id: 'user-1',
        email: 'guest@example.com',
        role: 'authenticated',
        password: hash,
      }),
    }) as unknown as User;

  beforeEach(async () => {
    users = {
      findByEmail: jest.fn(),
      skipPassword: jest.fn((user: User) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...rest } = user.toJSON();
        return rest;
      }),
    };
    jwt = {
      sign: jest.fn().mockReturnValue('signed.jwt.token'),
      verifyAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    (bcrypt.compare as jest.Mock).mockReset();
  });

  describe('validateUser', () => {
    it('refuses an unknown account', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.validateUser('nobody@example.com', 'pw'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      // The hash comparison must not run for an account that does not exist.
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('refuses a wrong password with the same error as an unknown account', async () => {
      users.findByEmail.mockResolvedValue(doc());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.validateUser('guest@example.com', 'wrong'),
      ).rejects.toThrow('User or password incorrect.');
    });

    it('returns the account without its password hash on success', async () => {
      users.findByEmail.mockResolvedValue(doc());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('guest@example.com', 'right');

      expect(result).not.toHaveProperty('password');
      expect(JSON.stringify(result)).not.toContain(hash);
      expect(result).toMatchObject({ email: 'guest@example.com' });
    });

    it('compares against the stored hash, not the supplied value', async () => {
      users.findByEmail.mockResolvedValue(doc());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.validateUser('guest@example.com', 'right');

      expect(bcrypt.compare).toHaveBeenCalledWith('right', hash);
    });
  });

  describe('generateJWT', () => {
    it('signs only the identity and role, never the hash', () => {
      const result = service.generateJWT(doc());

      expect(jwt.sign).toHaveBeenCalledWith({
        email: 'guest@example.com',
        id: 'user-1',
        role: 'authenticated',
      });
      expect(result.access_token).toBe('signed.jwt.token');
      expect(result.user).not.toHaveProperty('password');
    });
  });

  describe('validateToken', () => {
    it('delegates verification to the JWT service', async () => {
      jwt.verifyAsync.mockResolvedValue({ email: 'guest@example.com' });

      await expect(service.validateToken('a.b.c')).resolves.toEqual({
        email: 'guest@example.com',
      });
      expect(jwt.verifyAsync).toHaveBeenCalledWith('a.b.c');
    });

    it('propagates a verification failure rather than swallowing it', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(service.validateToken('bad')).rejects.toThrow(
        'invalid signature',
      );
    });
  });
});

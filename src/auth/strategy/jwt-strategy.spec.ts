import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtStrategy } from './jwt-strategy';
import { UsersService } from '../../users/users.service';
import { Role } from '../models/role.model';

describe('JwtStrategy', () => {
  const config = {
    get: jest.fn().mockReturnValue('a'.repeat(32)),
  } as unknown as ConfigService;

  const usersService = {
    findById: jest.fn(),
  } as unknown as UsersService;

  const strategy = () => new JwtStrategy(config, usersService);

  beforeEach(() => jest.clearAllMocks());

  it('reads the signing secret from configuration rather than process.env', () => {
    expect(strategy()).toBeDefined();
    expect(config.get).toHaveBeenCalledWith('SECRET');
  });

  it('returns the role stored on the account, not the role in the token', async () => {
    // The token was minted while this account was an administrator; it has since been demoted.
    (usersService.findById as jest.Mock).mockResolvedValue({
      _id: 'user-1',
      email: 'guest@test.local',
      role: Role.AUTHENTICATED,
    });

    const user = await strategy().validate({
      id: 'user-1',
      email: 'guest@test.local',
      role: Role.ADMIN,
    });

    expect(user.role).toBe(Role.AUTHENTICATED);
  });

  it('rejects a token whose account no longer exists', async () => {
    (usersService.findById as jest.Mock).mockResolvedValue(null);

    await expect(
      strategy().validate({
        id: 'gone',
        email: 'x@test.local',
        role: Role.ADMIN,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  /**
   * After a password recovery, sessions issued before it are refused (specs/012-password-recovery,
   * FR-013, research R6). `iat` is in whole seconds, so a token from the same second as the
   * recovery is accepted: otherwise the user's own sign-in straight after a reset could be
   * refused at random.
   */
  describe('sessions issued before a password recovery', () => {
    const changedAt = new Date('2026-10-01T12:00:00.500Z');
    const changedSecond = 1790856000;
    const payload = {
      id: 'user-1',
      email: 'guest@test.local',
      role: Role.AUTHENTICATED,
    };

    const recovered = () =>
      (usersService.findById as jest.Mock).mockResolvedValue({
        _id: 'user-1',
        email: 'guest@test.local',
        role: Role.AUTHENTICATED,
        passwordChangedAt: changedAt,
      });

    it('pins the boundary second', () => {
      expect(Math.floor(changedAt.getTime() / 1000)).toBe(changedSecond);
    });

    it('refuses a token issued the second before', async () => {
      recovered();

      await expect(
        strategy().validate({ ...payload, iat: changedSecond - 1 }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('accepts a token issued in the same second', async () => {
      recovered();

      await expect(
        strategy().validate({ ...payload, iat: changedSecond }),
      ).resolves.toMatchObject({ id: 'user-1' });
    });

    it('accepts a token issued afterwards', async () => {
      recovered();

      await expect(
        strategy().validate({ ...payload, iat: changedSecond + 1 }),
      ).resolves.toMatchObject({ id: 'user-1' });
    });

    it('leaves accounts that were never recovered alone', async () => {
      (usersService.findById as jest.Mock).mockResolvedValue({
        _id: 'user-1',
        email: 'guest@test.local',
        role: Role.AUTHENTICATED,
      });

      await expect(
        strategy().validate({ ...payload, iat: 1 }),
      ).resolves.toMatchObject({ id: 'user-1' });
    });

    it('fails closed on a token without an issue time', async () => {
      recovered();

      await expect(strategy().validate(payload)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});

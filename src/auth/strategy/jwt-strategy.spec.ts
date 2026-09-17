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
});

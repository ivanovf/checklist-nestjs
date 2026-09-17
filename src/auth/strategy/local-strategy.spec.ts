import { UnauthorizedException } from '@nestjs/common';

import { LocalStrategy } from './local-strategy';
import { AuthService } from '../services/auth.service';

describe('LocalStrategy', () => {
  const authService = {
    validateUser: jest.fn(),
  } as unknown as AuthService;

  const strategy = () => new LocalStrategy(authService);

  beforeEach(() => jest.clearAllMocks());

  it('returns the account when the credentials verify', async () => {
    const account = { email: 'owner@test.local', role: 'admin' };
    (authService.validateUser as jest.Mock).mockResolvedValue(account);

    await expect(
      strategy().validate('owner@test.local', 'correct'),
    ).resolves.toBe(account);
    expect(authService.validateUser).toHaveBeenCalledWith(
      'owner@test.local',
      'correct',
    );
  });

  it('refuses when the credentials do not verify', async () => {
    (authService.validateUser as jest.Mock).mockResolvedValue(null);

    await expect(
      strategy().validate('owner@test.local', 'wrong'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

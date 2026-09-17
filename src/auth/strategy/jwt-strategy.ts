import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  email: string;
  id: string;
  role: string;
}

export interface AuthenticatedUser {
  email: string;
  id: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('SECRET'),
    });
  }

  /**
   * Resolves the caller's role from the account record rather than the token claim.
   *
   * Tokens live for 24 hours, so trusting the claim minted at sign-in means demoting or
   * removing an administrator has no effect for up to a day. This costs one primary-key read
   * per authenticated request, which is the price of revocation taking effect immediately.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const account = await this.usersService.findById(payload.id);

    // The account was deleted after the token was issued.
    if (!account) {
      throw new UnauthorizedException();
    }

    return {
      email: account.email,
      id: String(account._id),
      role: account.role,
    };
  }
}

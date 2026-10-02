import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  email: string;
  id: string;
  role: string;
  /** Issue time in whole seconds, set by the signer. */
  iat?: number;
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

    // The password was recovered after the token was issued (specs/012-password-recovery,
    // FR-013, research R6). `iat` is in whole seconds, so a token from the same second as the
    // recovery is accepted: otherwise a sign-in right after a reset could be refused at random.
    // A token without `iat` fails closed. The account read above already happens on every
    // request, so this costs nothing extra.
    if (
      account.passwordChangedAt &&
      !(
        typeof payload.iat === 'number' &&
        payload.iat >= Math.floor(account.passwordChangedAt.getTime() / 1000)
      )
    ) {
      throw new UnauthorizedException();
    }

    return {
      email: account.email,
      id: String(account._id),
      role: account.role,
    };
  }
}

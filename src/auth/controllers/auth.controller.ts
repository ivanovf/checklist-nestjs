import {
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, ThrottlerGuard, seconds } from '@nestjs/throttler';
import { Request } from 'express';
import { User } from '../../users/entities/user.entity';
import { AuthService } from '../services/auth.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('login')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Five attempts per minute per source. ThrottlerGuard is deliberately listed BEFORE
   * AuthGuard: guards run in declaration order, so if authentication ran first a wrong
   * password would throw 401 before the counter incremented — failed sign-in attempts would
   * never be counted and the limit would protect nothing.
   *
   * No blockDuration: the refusal must lift when the window resets (SC-010).
   */
  @Public()
  @UseGuards(ThrottlerGuard, AuthGuard('local'))
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post()
  login(@Req() req: Request) {
    const user = req.user as User;
    return this.authService.generateJWT(user);
  }

  @Get('validate')
  async validateToken(@Headers('authorization') authHeader: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authorization header');
    }

    const token = authHeader.substring('Bearer '.length);
    try {
      const decoded = await this.authService.validateToken(token);
      // if the token is valid, the decoded data will be returned
      return { access: true, user: decoded };
    } catch {
      // if the token is invalid, an error will be thrown
      throw new UnauthorizedException('Invalid token');
    }
  }
}

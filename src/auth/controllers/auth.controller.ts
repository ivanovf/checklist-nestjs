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
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { User } from '../../users/entities/user.entity';
import { AuthService } from '../services/auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { ApiRefusals } from '../../common/decorators/api-refusals.decorator';
import { LoginRequestDto } from '../dto/login-request.dto';
import { LoginResponseDto } from '../dto/login-response.dto';
import { TokenValidationResponseDto } from '../dto/token-validation-response.dto';

@ApiTags('Auth')
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
  @ApiOperation({ summary: 'Sign in and receive a bearer token' })
  // Read by the Passport local strategy, not bound with @Body(), so it is declared here.
  @ApiBody({ type: LoginRequestDto })
  @ApiCreatedResponse({
    type: LoginResponseDto,
    description: 'Signed in.',
  })
  @ApiRefusals(401, 429)
  login(@Req() req: Request) {
    const user = req.user as User;
    return this.authService.generateJWT(user);
  }

  @Get('validate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check a bearer token and read its payload' })
  @ApiOkResponse({
    type: TokenValidationResponseDto,
    description: 'The token is valid.',
  })
  @ApiRefusals(401)
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

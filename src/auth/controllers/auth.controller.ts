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
import { Request } from 'express';
import { User } from '../../users/entities/user.entity';
import { AuthService } from '../services/auth.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('login')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @UseGuards(AuthGuard('local'))
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
    } catch (err) {
      // if the token is invalid, an error will be thrown
      throw new UnauthorizedException('Invalid token');
    }
  }
}

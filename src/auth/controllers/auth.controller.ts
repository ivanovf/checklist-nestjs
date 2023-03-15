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
import { User } from 'src/users/entities/user.entity';
import { RolesGuard } from '../guards/roles.guard';
import { AuthService } from '../services/auth.service';

@Controller('login')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(AuthGuard('local'))
  @Post()
  login(@Req() req: Request) {
    const user = req.user as User;
    return this.authService.generateJWT(user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
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

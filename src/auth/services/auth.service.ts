import { Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private userService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.userService.findByEmail(email);

    if (user) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        return this.userService.skipPassword(user);
      }
    }

    return null;
  }

  generateJWT(user: User) {
    const payload = { name: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      user,
    }
  }
}

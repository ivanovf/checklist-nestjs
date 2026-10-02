import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

import { UsersModule } from '../users/users.module';
import { AuthService } from './services/auth.service';
import { LocalStrategy } from './strategy/local-strategy';
import { AuthController } from './controllers/auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategy/jwt-strategy';
import { PasswordRecoveryController } from './controllers/password-recovery.controller';
import { PasswordRecoveryService } from './services/password-recovery.service';
import {
  PasswordRecovery,
  PasswordRecoverySchema,
} from './entities/password-recovery.entity';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    MongooseModule.forFeature([
      { name: PasswordRecovery.name, schema: PasswordRecoverySchema },
    ]),
    JwtModule.registerAsync({
      // Injected rather than read from process.env, so the signing secret cannot be picked up
      // before startup validation has confirmed it meets the minimum strength.
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          secret: config.get<string>('SECRET'),
          signOptions: {
            expiresIn: '1d',
          },
        };
      },
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy, PasswordRecoveryService],
  controllers: [AuthController, PasswordRecoveryController],
})
export class AuthModule {}

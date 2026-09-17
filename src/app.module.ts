import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ItemsModule } from './items/items.module';
import { ReservationsModule } from './reservations/reservations.module';
import { DatabaseModule } from '../database.module';
import { AuthModule } from './auth/auth.module';
import { LocksModule } from './locks/locks.module';
import { ConfigModule as ConfigAppModule } from './config/config.module';
import { ActivityModule } from './activity/activity.module';
import { ActivityTypeModule } from './activity-type/activity-type.module';
import { envValidationSchema } from './config/env.validation';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    // MUST stay first. Every other module reads configuration through ConfigService, and the
    // validation below has to run before anything consumes a value. Previously this sat fourth,
    // after DatabaseModule, so whether secrets were populated depended on module init order.
    ConfigModule.forRoot({
      envFilePath: `.env.${process.env.NODE_ENV || 'local'}`,
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        // Report every failing value in one pass rather than stopping at the first.
        abortEarly: false,
      },
    }),
    DatabaseModule,
    UsersModule,
    ItemsModule,
    ReservationsModule,
    LocksModule,
    AuthModule,
    ConfigAppModule,
    ActivityModule,
    ActivityTypeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Order matters: APP_GUARD providers run in registration order, so authentication
    // resolves request.user before the role check reads it. Registering both globally is
    // what makes access control default-deny — a route that forgets to declare anything is
    // now refused rather than served.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

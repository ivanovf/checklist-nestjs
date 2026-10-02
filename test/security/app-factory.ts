import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, seconds } from '@nestjs/throttler';

import { AppController } from '../../src/app.controller';
import { AppService } from '../../src/app.service';
import { UsersModule } from '../../src/users/users.module';
import { ItemsModule } from '../../src/items/items.module';
import { ReservationsModule } from '../../src/reservations/reservations.module';
import { AuthModule } from '../../src/auth/auth.module';
import { LocksModule } from '../../src/locks/locks.module';
import { ConfigModule as ConfigAppModule } from '../../src/config/config.module';
import { ActivityModule } from '../../src/activity/activity.module';
import { ActivityTypeModule } from '../../src/activity-type/activity-type.module';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { HealthModule } from '../../src/health/health.module';
import { applyRequestRules, configureApp } from '../../src/bootstrap';

/**
 * Options for exercising the real transport setup.
 *
 * Off by default so the authorization suite keeps booting the plain application it was
 * written against. When `transport` is set, the app is configured through the very same
 * `configureApp` the two production entry points use — testing a reimplementation of it
 * would prove nothing about what actually ships.
 */
export interface TestAppOptions {
  transport?: boolean;
  nodeEnv?: 'local' | 'production';
  corsOrigins?: string;
}

/**
 * Boots the real application against the in-memory MongoDB started by global-setup.
 *
 * Mirrors AppModule exactly apart from the database connection — in particular the same
 * APP_GUARD chain in the same order, since that ordering is the thing under test.
 */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication> {
  // ConfigService snapshots process.env at module initialisation, so these have to be in
  // place before the testing module is compiled. The caller restores them.
  if (options.nodeEnv) {
    process.env.NODE_ENV = options.nodeEnv;
  }
  if (options.corsOrigins !== undefined) {
    process.env.CORS_ORIGINS = options.corsOrigins;
  }

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      MongooseModule.forRoot(process.env.MONGO_URI as string),
      UsersModule,
      ItemsModule,
      ReservationsModule,
      LocksModule,
      AuthModule,
      ConfigAppModule,
      ActivityModule,
      ActivityTypeModule,
      HealthModule,
      ThrottlerModule.forRoot([
        { name: 'default', ttl: seconds(60), limit: 20 },
      ]),
    ],
    controllers: [AppController],
    providers: [
      AppService,
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();

  if (options.transport) {
    configureApp(app);
  } else {
    // The same request rules the shipped app uses, not a copy that could drift from them
    // (specs/010-fix-unknown-fields, research R8).
    applyRequestRules(app);
    app.setGlobalPrefix('api');
  }

  await app.init();
  return app;
}

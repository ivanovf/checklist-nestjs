import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

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

/**
 * Boots the real application against the in-memory MongoDB started by global-setup.
 *
 * Mirrors AppModule exactly apart from the database connection — in particular the same
 * APP_GUARD chain in the same order, since that ordering is the thing under test.
 */
export async function createTestApp(): Promise<INestApplication> {
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
    ],
    controllers: [AppController],
    providers: [
      AppService,
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.setGlobalPrefix('api');

  await app.init();
  return app;
}

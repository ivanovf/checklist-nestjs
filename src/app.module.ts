import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ItemsModule } from './items/items.module';
import { ReservationsModule } from './reservations/reservations.module';
import { DatabaseModule } from 'database.module';
import { AuthModule } from './auth/auth.module';
import { LocksModule } from './locks/locks.module';
import { ConfigModule as ConfigAppModule } from './config/config.module';

@Module({
  imports: [
    UsersModule,
    ItemsModule,
    ReservationsModule,
    LocksModule,
    DatabaseModule,
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    AuthModule,
    ConfigAppModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

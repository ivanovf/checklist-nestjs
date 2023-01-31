import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ItemsModule } from './items/items.module';
import { ReservationsModule } from './reservations/reservations.module';
import { DatabaseModule } from 'database.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    UsersModule,
    ItemsModule,
    ReservationsModule,
    DatabaseModule,
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

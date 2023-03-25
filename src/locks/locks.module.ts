import { Module } from '@nestjs/common';
import { LocksService } from './locks.service';
import { LocksController } from './locks.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Lock, LockSchema } from './entities/lock.entity';

@Module({
  controllers: [LocksController],
  providers: [LocksService],
  imports: [
    MongooseModule.forFeature([
      {
        name: Lock.name,
        schema: LockSchema,
      },
    ]),
  ],
  exports: [LocksService],
})
export class LocksModule {}

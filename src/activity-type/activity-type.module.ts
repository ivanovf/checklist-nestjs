import { Module } from '@nestjs/common';
import { ActivityTypeService } from './activity-type.service';
import { ActivityTypeController } from './activity-type.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ActivityType,
  ActivityTypeSchema,
} from './entities/activity-type.entity';

@Module({
  controllers: [ActivityTypeController],
  providers: [ActivityTypeService],
  imports: [
    // Import the MongooseModule in the ActivityTypeModule
    MongooseModule.forFeature([
      {
        name: ActivityType.name,
        schema: ActivityTypeSchema,
      },
    ]),
  ],
  exports: [ActivityTypeService],
})
export class ActivityTypeModule {}

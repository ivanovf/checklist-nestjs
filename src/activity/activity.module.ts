import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Activity, ActivitySchema } from './entities/activity.entity';
import {
  ActivityType,
  ActivityTypeSchema,
} from 'src/activity-type/entities/activity-type.entity';

@Module({
  controllers: [ActivityController],
  providers: [ActivityService],
  imports: [
    // Import the MongooseModule in the ActivityTypeModule
    MongooseModule.forFeature([
      {
        name: Activity.name,
        schema: ActivitySchema,
      },
      {
        name: ActivityType.name,
        schema: ActivityTypeSchema,
      },
    ]),
  ],
  exports: [ActivityService],
})
export class ActivityModule {}

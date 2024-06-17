import { Injectable } from '@nestjs/common';
import { CreateActivityTypeDto } from './dto/create-activity-type.dto';
import { UpdateActivityTypeDto } from './dto/update-activity-type.dto';
import { InjectModel } from '@nestjs/mongoose';
import { ActivityType } from './entities/activity-type.entity';
import { Model } from 'mongoose';

@Injectable()
export class ActivityTypeService {
  constructor(
    @InjectModel(ActivityType.name)
    private activityTypeModel: Model<ActivityType>,
  ) {}

  create(createActivityTypeDto: CreateActivityTypeDto) {
    const newActivityType = new this.activityTypeModel(createActivityTypeDto);
    return newActivityType.save();
  }

  findAll() {
    return this.activityTypeModel.find();
  }

  findOne(id: string) {
    const activityType = this.activityTypeModel.findById(id);
    return activityType;
  }

  update(id: string, updateActivityTypeDto: UpdateActivityTypeDto) {
    const activityType = this.activityTypeModel.findByIdAndUpdate(
      id,
      { $set: updateActivityTypeDto },
      { new: true },
    );
    return activityType;
  }

  remove(id: number) {
    return this.activityTypeModel.findByIdAndDelete(id);
  }
}

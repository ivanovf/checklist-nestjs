import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity } from './entities/activity.entity';
import { ActivityType } from 'src/activity-type/entities/activity-type.entity';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
    @InjectModel(ActivityType.name)
    private activityTypeModel: Model<ActivityType>,
  ) {}

  async create(createActivityDto: CreateActivityDto) {
    const typeId = new Types.ObjectId(createActivityDto.type);
    const type = await this.activityTypeModel.findById(typeId).exec();

    if (!type) {
      throw new NotFoundException('Activity type not found');
    }
    const activity = new this.activityModel(createActivityDto);
    return activity.save();
  }

  findAll() {
    return this.activityModel.find().populate('type').exec();
  }

  async findOne(id: string): Promise<Activity> {
    const activity = await this.activityModel
      .findById(id)
      .populate('type')
      .exec();

    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    return activity;
  }

  update(id: string, updateActivityDto: UpdateActivityDto) {
    return this.activityModel.findByIdAndUpdate(
      id,
      { $set: updateActivityDto },
      { new: true },
    );
  }

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Invalid id');
    }

    const activity = await this.activityModel.findById(id).exec();

    if (!activity) {
      throw new NotFoundException('Activity not found');
    }

    return this.activityModel.findByIdAndDelete(id);
  }
}

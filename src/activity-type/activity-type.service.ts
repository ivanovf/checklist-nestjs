import { Injectable, NotFoundException } from '@nestjs/common';
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

  // Each by-id operation awaits its query and refuses an unknown id. They used to return the
  // bare query, so an unknown id was answered as an empty success (D2,
  // specs/008-fix-unknown-id-404).
  async findOne(id: string) {
    return this.found(id, await this.activityTypeModel.findById(id).exec());
  }

  async update(id: string, updateActivityTypeDto: UpdateActivityTypeDto) {
    const updated = await this.activityTypeModel
      .findByIdAndUpdate(id, { $set: updateActivityTypeDto }, { new: true })
      .exec();

    return this.found(id, updated);
  }

  async remove(id: string) {
    return this.found(
      id,
      await this.activityTypeModel.findByIdAndDelete(id).exec(),
    );
  }

  private found<T>(id: string, record: T | null): T {
    if (!record) {
      throw new NotFoundException(`activity type #${id} not found`);
    }
    return record;
  }
}

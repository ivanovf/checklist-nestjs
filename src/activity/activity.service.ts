import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Activity } from './entities/activity.entity';
import { ActivityType } from '../activity-type/entities/activity-type.entity';
import { FilterActivityDto } from './dto/filter-activity.dto';
import {
  ActivityRecordResponseDto,
  ActivityResponseDto,
  toActivityRecordResponse,
  toActivityResponse,
} from './dto/activity-response.dto';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
    @InjectModel(ActivityType.name)
    private activityTypeModel: Model<ActivityType>,
  ) {}

  // Every answer goes through a response DTO, so no stored document leaves the service as it
  // is (D3, specs/009-fix-unprojected-records). Reads populate the type and answer it as an
  // activity type; create and update answer its id.
  async create(
    createActivityDto: CreateActivityDto,
  ): Promise<ActivityRecordResponseDto> {
    const typeId = new Types.ObjectId(createActivityDto.type);
    const type = await this.activityTypeModel.findById(typeId).exec();

    if (!type) {
      throw new NotFoundException('Activity type not found');
    }
    const activity = new this.activityModel(createActivityDto);
    return toActivityRecordResponse(await activity.save());
  }

  async findAll(filter: FilterActivityDto): Promise<ActivityResponseDto[]> {
    // Only the filters become query conditions; `limit` and `offset` page the result.
    const query: FilterQuery<Activity> = {};

    if (filter.type) {
      query.type = filter.type;
    }

    if (filter.status) {
      query.status = filter.status;
    }

    // Compared with undefined, not by truthiness: a price of 0 is a real filter. The handler
    // used to get the raw string '0', which is truthy; converted, it is the falsy number 0.
    if (filter.price !== undefined) {
      query.price = filter.price;
    }

    // Newest first. Activities often share a date, so the id breaks ties: without it their
    // order is not fixed and pages could repeat or skip them (specs/011-fix-unbounded-lists,
    // R4). Both fields are indexed (activity.entity.ts).
    const activities = await this.activityModel
      .find(query)
      .sort({ date: -1, _id: -1 })
      .skip(filter.offset)
      .limit(filter.limit)
      .populate('type')
      .exec();
    return activities.map(toActivityResponse);
  }

  async findOne(id: string): Promise<ActivityResponseDto> {
    const activity = await this.activityModel
      .findById(id)
      .populate('type')
      .exec();

    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    return toActivityResponse(activity);
  }

  async update(
    id: string,
    updateActivityDto: UpdateActivityDto,
  ): Promise<ActivityRecordResponseDto> {
    // There was no existence check, so an unknown id was answered as an empty success
    // (D2, specs/008-fix-unknown-id-404).
    const updated = await this.activityModel
      .findByIdAndUpdate(id, { $set: updateActivityDto }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException('Activity not found');
    }
    return toActivityRecordResponse(updated);
  }

  async remove(id: string) {
    const removed = await this.activityModel.findByIdAndDelete(id).exec();

    if (!removed) {
      throw new NotFoundException('Activity not found');
    }
    return removed;
  }
}

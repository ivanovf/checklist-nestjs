import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateActivityTypeDto } from './dto/create-activity-type.dto';
import { UpdateActivityTypeDto } from './dto/update-activity-type.dto';
import { InjectModel } from '@nestjs/mongoose';
import { ActivityType } from './entities/activity-type.entity';
import { Model } from 'mongoose';
import {
  ActivityTypeResponseDto,
  toActivityTypeResponse,
} from './dto/activity-type-response.dto';

@Injectable()
export class ActivityTypeService {
  constructor(
    @InjectModel(ActivityType.name)
    private activityTypeModel: Model<ActivityType>,
  ) {}

  // Every answer goes through ActivityTypeResponseDto, so no stored document leaves the
  // service as it is (D3, specs/009-fix-unprojected-records).
  async create(
    createActivityTypeDto: CreateActivityTypeDto,
  ): Promise<ActivityTypeResponseDto> {
    const newActivityType = new this.activityTypeModel(createActivityTypeDto);
    return toActivityTypeResponse(await newActivityType.save());
  }

  async findAll(
    limit: number,
    offset: number,
  ): Promise<ActivityTypeResponseDto[]> {
    // `_id` gives a total order, so consecutive pages never repeat or skip a record. It is
    // always indexed (constitution Principle V; specs/011-fix-unbounded-lists, R4).
    const types = await this.activityTypeModel
      .find()
      .sort({ _id: 1 })
      .skip(offset)
      .limit(limit)
      .exec();
    return types.map(toActivityTypeResponse);
  }

  // Each by-id operation awaits its query and refuses an unknown id. They used to return the
  // bare query, so an unknown id was answered as an empty success (D2,
  // specs/008-fix-unknown-id-404).
  async findOne(id: string): Promise<ActivityTypeResponseDto> {
    return this.found(id, await this.activityTypeModel.findById(id).exec());
  }

  async update(
    id: string,
    updateActivityTypeDto: UpdateActivityTypeDto,
  ): Promise<ActivityTypeResponseDto> {
    const updated = await this.activityTypeModel
      .findByIdAndUpdate(id, { $set: updateActivityTypeDto }, { new: true })
      .exec();

    return this.found(id, updated);
  }

  async remove(id: string): Promise<ActivityTypeResponseDto> {
    return this.found(
      id,
      await this.activityTypeModel.findByIdAndDelete(id).exec(),
    );
  }

  private found(id: string, record: object | null): ActivityTypeResponseDto {
    if (!record) {
      throw new NotFoundException(`activity type #${id} not found`);
    }
    return toActivityTypeResponse(record);
  }
}

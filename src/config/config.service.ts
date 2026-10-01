import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { Config } from './entities/config.entity';
import { TankLevelConfigDto } from './dto/tank-level-config.dto';

@Injectable()
export class ConfigService {
  constructor(@InjectModel(Config.name) private configModel: Model<Config>) {}

  create(createConfigDto: CreateConfigDto) {
    const newConfig = new this.configModel(createConfigDto);
    return newConfig.save();
  }

  // There used to be a not-found check here. It tested the unawaited query, which is never
  // falsy, so it could not fire; an empty list answers `[]` (specs/011-fix-unbounded-lists).
  findAll(limit: number, offset: number) {
    // `_id` gives a total order, so consecutive pages never repeat or skip a record. It is
    // always indexed (constitution Principle V; specs/011-fix-unbounded-lists, R4).
    return this.configModel
      .find()
      .sort({ _id: 1 })
      .skip(offset)
      .limit(limit)
      .exec();
  }

  async update(id: string, updateConfigDto: UpdateConfigDto) {
    // Awaited before the check: an unawaited query is always truthy, so the not-found branch
    // never ran and an unknown id was answered as success (D2, specs/008-fix-unknown-id-404).
    const appConf = await this.configModel
      .findByIdAndUpdate(id, { $set: updateConfigDto }, { new: true })
      .exec();

    if (!appConf) {
      throw new NotFoundException(`config #${id} not found`);
    }
    return appConf;
  }

  async updateAnalogLecure(id: string, tankLevelConfigDto: TankLevelConfigDto) {
    if (tankLevelConfigDto.apiKey !== process.env.TANK_API_KEY) {
      throw new NotFoundException('Invalid API Key');
    }

    const appConf = await this.configModel
      .findByIdAndUpdate(id, { $set: tankLevelConfigDto }, { new: true })
      .exec();

    if (!appConf) {
      throw new NotFoundException(`config #${id} not found`);
    }
    return appConf;
  }
}

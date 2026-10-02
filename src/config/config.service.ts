import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { Config } from './entities/config.entity';
import { TankLevelConfigDto } from './dto/tank-level-config.dto';
import { ConfigResponseDto, toConfigResponse } from './dto/config-response.dto';

@Injectable()
export class ConfigService {
  constructor(@InjectModel(Config.name) private configModel: Model<Config>) {}

  // Every answer goes through ConfigResponseDto, so no stored document leaves the service as
  // it is (D3, specs/009-fix-unprojected-records).
  async create(createConfigDto: CreateConfigDto): Promise<ConfigResponseDto> {
    const newConfig = new this.configModel(createConfigDto);
    return toConfigResponse(await newConfig.save());
  }

  // There used to be a not-found check here. It tested the unawaited query, which is never
  // falsy, so it could not fire; an empty list answers `[]` (specs/011-fix-unbounded-lists).
  async findAll(limit: number, offset: number): Promise<ConfigResponseDto[]> {
    // `_id` gives a total order, so consecutive pages never repeat or skip a record. It is
    // always indexed (constitution Principle V; specs/011-fix-unbounded-lists, R4).
    const configs = await this.configModel
      .find()
      .sort({ _id: 1 })
      .skip(offset)
      .limit(limit)
      .exec();
    return configs.map(toConfigResponse);
  }

  async update(
    id: string,
    updateConfigDto: UpdateConfigDto,
  ): Promise<ConfigResponseDto> {
    // Awaited before the check: an unawaited query is always truthy, so the not-found branch
    // never ran and an unknown id was answered as success (D2, specs/008-fix-unknown-id-404).
    const appConf = await this.configModel
      .findByIdAndUpdate(id, { $set: updateConfigDto }, { new: true })
      .exec();

    if (!appConf) {
      throw new NotFoundException(`config #${id} not found`);
    }
    return toConfigResponse(appConf);
  }

  async updateAnalogLecure(
    id: string,
    tankLevelConfigDto: TankLevelConfigDto,
  ): Promise<ConfigResponseDto> {
    if (tankLevelConfigDto.apiKey !== process.env.TANK_API_KEY) {
      throw new NotFoundException('Invalid API Key');
    }

    const appConf = await this.configModel
      .findByIdAndUpdate(id, { $set: tankLevelConfigDto }, { new: true })
      .exec();

    if (!appConf) {
      throw new NotFoundException(`config #${id} not found`);
    }
    return toConfigResponse(appConf);
  }
}

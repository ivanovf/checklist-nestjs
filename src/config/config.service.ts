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

  // An empty list is answered as an empty list. The old `if (!conf)` tested an unawaited query,
  // which is never falsy, so its 404 could not happen, and the contract doesn't document one.
  async findAll(): Promise<ConfigResponseDto[]> {
    const configs = await this.configModel.find().exec();
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

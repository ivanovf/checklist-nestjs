import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { Config } from './entities/config.entity';

@Injectable()
export class ConfigService {
  constructor(@InjectModel(Config.name) private configModel: Model<Config>) {}

  create(createConfigDto: CreateConfigDto) {
    const newConfig = new this.configModel(createConfigDto);
    return newConfig.save();
  }

  findAll() {
    const conf = this.configModel.find();

    if (!conf) {
      throw new NotFoundException(`Configs not found`);
    }
    return conf;
  }

  update(id: string, updateConfigDto: UpdateConfigDto) {
    const appConf = this.configModel
      .findByIdAndUpdate(id, { $set: updateConfigDto }, { new: true })
      .exec();

    if (!appConf) {
      throw new NotFoundException(id);
    }
    return appConf;
  }

  updateAnalogLecure(id: string, updateConfigDto: UpdateConfigDto) {
    if (!updateConfigDto.analogLecture) {
      throw new NotFoundException(`Analog lecture not found`);
    }

    const appConf = this.configModel
      .findByIdAndUpdate(id, { $set: updateConfigDto }, { new: true })
      .exec();

    if (!appConf) {
      throw new NotFoundException(id);
    }
    return appConf;
  }
}

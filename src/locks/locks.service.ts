import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { CreateLockDto } from './dto/create-lock.dto';
import { UpdateLockDto } from './dto/update-lock.dto';
import { Lock } from './entities/lock.entity';

@Injectable()
export class LocksService {
  constructor(@InjectModel(Lock.name) private lockModel: Model<Lock>) {}

  create(createLockDto: CreateLockDto) {
    const newLock = new this.lockModel(createLockDto);
    return newLock.save();
  }

  update(id: string, updateLockDto: UpdateLockDto) {
    const lockUpdate = this.lockModel
      .findByIdAndUpdate(id, { $set: updateLockDto }, { new: true })
      .exec();

    if (!lockUpdate) {
      throw new NotFoundException(id);
    }
    return lockUpdate;
  }

  findAll(limit: number, offset: number) {
    return this.lockModel.find().limit(limit).skip(offset);
  }

  findOne(id: string) {
    const lock = this.lockModel.findById(id);

    if (!lock) {
      throw new NotFoundException(`Lock #${id} not found`);
    }
    return lock;
  }

  remove(id: string) {
    const lock = this.lockModel.findByIdAndDelete(id).exec();

    if (!lock) {
      throw new NotFoundException(id);
    }
    return { deleted: true };
  }
}

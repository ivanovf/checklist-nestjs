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

  async update(id: string, updateLockDto: UpdateLockDto) {
    // Awaited before the check: an unawaited query is always truthy, so the not-found branch
    // never ran and an unknown id was answered as success (D2, specs/008-fix-unknown-id-404).
    const updated = await this.lockModel
      .findByIdAndUpdate(id, { $set: updateLockDto }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`lock #${id} not found`);
    }
    return updated;
  }

  findAll(limit: number, offset: number) {
    // `_id` gives a fixed order, so consecutive pages never repeat or skip a record. It is
    // always indexed (constitution Principle V; specs/007-fix-list-paging-defaults, R5).
    return this.lockModel.find().sort({ _id: 1 }).limit(limit).skip(offset);
  }

  async findOne(id: string) {
    const found = await this.lockModel.findById(id).exec();

    if (!found) {
      throw new NotFoundException(`lock #${id} not found`);
    }
    return found;
  }

  async remove(id: string) {
    // Reports a deletion only when a record was actually deleted.
    const removed = await this.lockModel.findByIdAndDelete(id).exec();

    if (!removed) {
      throw new NotFoundException(`lock #${id} not found`);
    }
    return { deleted: true };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Item } from './entities/item.entity';

@Injectable()
export class ItemsService {
  constructor(@InjectModel(Item.name) private itemModel: Model<Item>) {}

  create(createItemDto: CreateItemDto) {
    const newItem = new this.itemModel(createItemDto);
    return newItem.save();
  }

  update(id: string, updateItemDto: UpdateItemDto) {
    const itemUpdate = this.itemModel
      .findByIdAndUpdate(id, { $set: updateItemDto }, { new: true })
      .exec();

    if (!itemUpdate) {
      throw new NotFoundException(id);
    }
    return itemUpdate;
  }

  findAll(limit: number, offset: number) {
    // `_id` gives a fixed order, so consecutive pages never repeat or skip a record. It is
    // always indexed (constitution Principle V; specs/007-fix-list-paging-defaults, R5).
    return this.itemModel.find().sort({ _id: 1 }).limit(limit).skip(offset);
  }

  findOne(id: string) {
    const item = this.itemModel.findById(id);

    if (!item) {
      throw new NotFoundException(`Item #${id} not found`);
    }
    return item;
  }

  remove(id: string) {
    const item = this.itemModel.findByIdAndDelete(id).exec();

    if (!item) {
      throw new NotFoundException(id);
    }
    return { deleted: true };
  }
}

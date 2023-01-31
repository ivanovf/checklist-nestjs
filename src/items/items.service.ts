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
    return this.itemModel.find().limit(limit).skip(offset);
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

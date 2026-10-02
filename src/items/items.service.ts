import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Item } from './entities/item.entity';
import { ItemResponseDto, toItemResponse } from './dto/item-response.dto';

@Injectable()
export class ItemsService {
  constructor(@InjectModel(Item.name) private itemModel: Model<Item>) {}

  // Every answer goes through ItemResponseDto, so no stored document leaves the service as it is
  // (D3, specs/009-fix-unprojected-records).
  async create(createItemDto: CreateItemDto): Promise<ItemResponseDto> {
    const newItem = new this.itemModel(createItemDto);
    return toItemResponse(await newItem.save());
  }

  async update(
    id: string,
    updateItemDto: UpdateItemDto,
  ): Promise<ItemResponseDto> {
    // Awaited before the check: an unawaited query is always truthy, so the not-found branch
    // never ran and an unknown id was answered as success (D2, specs/008-fix-unknown-id-404).
    const updated = await this.itemModel
      .findByIdAndUpdate(id, { $set: updateItemDto }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`item #${id} not found`);
    }
    return toItemResponse(updated);
  }

  async findAll(limit: number, offset: number): Promise<ItemResponseDto[]> {
    // `_id` gives a fixed order, so consecutive pages never repeat or skip a record. It is
    // always indexed (constitution Principle V; specs/007-fix-list-paging-defaults, R5).
    const page = await this.itemModel
      .find()
      .sort({ _id: 1 })
      .limit(limit)
      .skip(offset)
      .exec();
    return page.map(toItemResponse);
  }

  async findOne(id: string): Promise<ItemResponseDto> {
    const found = await this.itemModel.findById(id).exec();

    if (!found) {
      throw new NotFoundException(`item #${id} not found`);
    }
    return toItemResponse(found);
  }

  async remove(id: string) {
    // Reports a deletion only when a record was actually deleted.
    const removed = await this.itemModel.findByIdAndDelete(id).exec();

    if (!removed) {
      throw new NotFoundException(`item #${id} not found`);
    }
    return { deleted: true };
  }
}

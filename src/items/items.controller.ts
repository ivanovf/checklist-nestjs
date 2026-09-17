import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';

@ApiTags('Items')
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() createItemDto: CreateItemDto) {
    return this.itemsService.create(createItemDto);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get('all')
  findAll(
    @Query('limit', ParseIntPipe) limit?: 10,
    @Query('offset', ParseIntPipe) offset?: 0,
  ) {
    return this.itemsService.findAll(limit, offset);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.itemsService.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() updateItemDto: UpdateItemDto) {
    return this.itemsService.update(id, updateItemDto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.itemsService.remove(id);
  }
}

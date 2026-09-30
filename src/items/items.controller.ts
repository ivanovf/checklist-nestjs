import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  ValidationPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiRefusals } from '../common/decorators/api-refusals.decorator';
import { ItemResponseDto } from './dto/item-response.dto';
import { DeletedResponseDto } from '../common/dto/deleted-response.dto';

import { ItemsService } from './items.service';
import { PaginationQueryDto } from '../filter_dto/pagination-query.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';

@ApiTags('Items')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create a checklist item' })
  @ApiCreatedResponse({
    type: ItemResponseDto,
    description: 'The created item.',
  })
  @ApiRefusals(400, 401, 403)
  create(@Body() createItemDto: CreateItemDto) {
    return this.itemsService.create(createItemDto);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get('all')
  @ApiOperation({ summary: 'List checklist items' })
  @ApiOkResponse({
    type: [ItemResponseDto],
    description: 'A page of items.',
  })
  @ApiRefusals(400, 401)
  findAll(
    // Paging is optional and bounded by PaginationQueryDto (D1 fixed by
    // specs/007-fix-list-paging-defaults). `whitelist` strips undeclared keys, as on the
    // reservation list; the service never reads them.
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: PaginationQueryDto,
  ) {
    return this.itemsService.findAll(query.limit, query.offset);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get(':id')
  @ApiOperation({ summary: 'Get a checklist item' })
  @ApiOkResponse({
    type: ItemResponseDto,
    description:
      'The item, or an empty body when no record has this id (discrepancy D2).',
  })
  @ApiRefusals(401)
  findOne(@Param('id') id: string) {
    return this.itemsService.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  @ApiOperation({ summary: 'Update a checklist item' })
  @ApiOkResponse({
    type: ItemResponseDto,
    description:
      'The updated item, or an empty body when no record has this id (discrepancy D2).',
  })
  @ApiRefusals(400, 401, 403)
  update(@Param('id') id: string, @Body() updateItemDto: UpdateItemDto) {
    return this.itemsService.update(id, updateItemDto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a checklist item' })
  @ApiOkResponse({
    type: DeletedResponseDto,
    description:
      'Deleted. Also answered for an id that matches no item (discrepancy D2).',
  })
  @ApiRefusals(401, 403)
  remove(@Param('id') id: string) {
    return this.itemsService.remove(id);
  }
}

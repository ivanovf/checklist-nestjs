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
import { LockResponseDto } from './dto/lock-response.dto';
import { DeletedResponseDto } from '../common/dto/deleted-response.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

import { LocksService } from './locks.service';
import { PaginationQueryDto } from '../filter_dto/pagination-query.dto';
import { CreateLockDto } from './dto/create-lock.dto';
import { UpdateLockDto } from './dto/update-lock.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';

@ApiTags('Locks')
@ApiBearerAuth()
@Controller('locks')
export class LocksController {
  constructor(private readonly locksService: LocksService) {}

  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create a lock code' })
  @ApiCreatedResponse({
    type: LockResponseDto,
    description: 'The created lock code.',
  })
  @ApiRefusals(400, 401, 403)
  create(@Body() createLockDto: CreateLockDto) {
    return this.locksService.create(createLockDto);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get('all')
  @ApiOperation({ summary: 'List lock codes' })
  @ApiOkResponse({
    type: [LockResponseDto],
    description: 'A page of lock codes.',
  })
  @ApiRefusals(400, 401)
  findAll(
    // Paging is optional and bounded by PaginationQueryDto (D1 fixed by
    // specs/007-fix-list-paging-defaults). `whitelist` strips undeclared keys, as on the
    // reservation list; the service never reads them.
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: PaginationQueryDto,
  ) {
    return this.locksService.findAll(query.limit, query.offset);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get(':id')
  @ApiOperation({ summary: 'Get a lock code' })
  @ApiOkResponse({
    type: LockResponseDto,
    description: 'The lock code.',
  })
  @ApiRefusals(400, 401, 404)
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.locksService.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  @ApiOperation({ summary: 'Update a lock code' })
  @ApiOkResponse({
    type: LockResponseDto,
    description: 'The updated lock code.',
  })
  @ApiRefusals(400, 401, 403, 404)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateLockDto: UpdateLockDto,
  ) {
    return this.locksService.update(id, updateLockDto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a lock code' })
  @ApiOkResponse({
    type: DeletedResponseDto,
    description: 'Deleted.',
  })
  @ApiRefusals(400, 401, 403, 404)
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.locksService.remove(id);
  }
}

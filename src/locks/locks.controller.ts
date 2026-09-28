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
    // Typed binding (discrepancy D4). Both values stay required, as they were (D1).
    @Query(new ValidationPipe({ transform: true })) query: PaginationQueryDto,
  ) {
    return this.locksService.findAll(query.limit, query.offset);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get(':id')
  @ApiOperation({ summary: 'Get a lock code' })
  @ApiOkResponse({
    type: LockResponseDto,
    description:
      'The lock code, or an empty body when no record has this id (discrepancy D2).',
  })
  @ApiRefusals(401)
  findOne(@Param('id') id: string) {
    return this.locksService.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  @ApiOperation({ summary: 'Update a lock code' })
  @ApiOkResponse({
    type: LockResponseDto,
    description:
      'The updated lock code, or an empty body when no record has this id (discrepancy D2).',
  })
  @ApiRefusals(400, 401, 403)
  update(@Param('id') id: string, @Body() updateLockDto: UpdateLockDto) {
    return this.locksService.update(id, updateLockDto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a lock code' })
  @ApiOkResponse({
    type: DeletedResponseDto,
    description:
      'Deleted. Also answered for an id that matches no lock code (discrepancy D2).',
  })
  @ApiRefusals(401, 403)
  remove(@Param('id') id: string) {
    return this.locksService.remove(id);
  }
}

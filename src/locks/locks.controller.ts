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

import { LocksService } from './locks.service';
import { CreateLockDto } from './dto/create-lock.dto';
import { UpdateLockDto } from './dto/update-lock.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';

@ApiTags('Locks')
@Controller('locks')
export class LocksController {
  constructor(private readonly locksService: LocksService) {}

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() createLockDto: CreateLockDto) {
    return this.locksService.create(createLockDto);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get('all')
  findAll(
    @Query('limit', ParseIntPipe) limit?: 10,
    @Query('offset', ParseIntPipe) offset?: 0,
  ) {
    return this.locksService.findAll(limit, offset);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.locksService.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() updateLockDto: UpdateLockDto) {
    return this.locksService.update(id, updateLockDto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.locksService.remove(id);
  }
}

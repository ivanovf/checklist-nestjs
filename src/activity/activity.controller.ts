import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FilterActivityDto } from './dto/filter-activity.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';

@ApiTags('Activity')
@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Roles(Role.ADMIN)
  @Post()
  @ApiResponse({ status: 201, description: 'Activity created successfully' })
  @ApiOperation({ summary: 'Create a new activity' })
  create(@Body() createActivityDto: CreateActivityDto) {
    return this.activityService.create(createActivityDto);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get()
  @ApiResponse({ status: 200, description: 'Return all activities' })
  @ApiOperation({ summary: 'Return all activities' })
  findAll(@Query() filterActivityDto: FilterActivityDto) {
    return this.activityService.findAll(filterActivityDto);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.activityService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateActivityDto: UpdateActivityDto,
  ) {
    return this.activityService.update(id, updateActivityDto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    // Awaited. The previous form tested the Promise itself, which is always truthy, so a
    // failed delete still reported success and the rejection escaped unhandled.
    await this.activityService.remove(id);

    return {
      message: 'Activity deleted successfully',
    };
  }
}

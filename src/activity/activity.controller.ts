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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiRefusals } from '../common/decorators/api-refusals.decorator';
import {
  ActivityDeletedResponseDto,
  ActivityRecordResponseDto,
  ActivityResponseDto,
} from './dto/activity-response.dto';
import { FilterActivityDto } from './dto/filter-activity.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';

@ApiTags('Activity')
@ApiBearerAuth()
@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create an activity' })
  @ApiCreatedResponse({
    type: ActivityRecordResponseDto,
    description: 'The created activity, with its type as an id.',
  })
  @ApiRefusals(400, 401, 403)
  create(@Body() createActivityDto: CreateActivityDto) {
    return this.activityService.create(createActivityDto);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get()
  @ApiOperation({ summary: 'List activities' })
  @ApiOkResponse({
    type: [ActivityResponseDto],
    description:
      'Matching activities, newest first, unpaginated (discrepancy D6).',
  })
  @ApiRefusals(400, 401)
  findAll(@Query() filterActivityDto: FilterActivityDto) {
    return this.activityService.findAll(filterActivityDto);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get(':id')
  @ApiOperation({ summary: 'Get an activity' })
  @ApiOkResponse({
    type: ActivityResponseDto,
    description: 'The activity, with its type populated.',
  })
  @ApiRefusals(401, 404)
  findOne(@Param('id') id: string) {
    return this.activityService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Put(':id')
  @ApiOperation({ summary: 'Update an activity' })
  @ApiOkResponse({
    type: ActivityRecordResponseDto,
    description:
      'The updated activity with its type as an id, or an empty body when no record has this id (discrepancy D2).',
  })
  @ApiRefusals(400, 401)
  update(
    @Param('id') id: string,
    @Body() updateActivityDto: UpdateActivityDto,
  ) {
    return this.activityService.update(id, updateActivityDto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an activity' })
  @ApiOkResponse({
    type: ActivityDeletedResponseDto,
    description: 'The activity was deleted.',
  })
  @ApiRefusals(401, 403, 404)
  async remove(@Param('id') id: string) {
    // Awaited. The previous form tested the Promise itself, which is always truthy, so a
    // failed delete still reported success and the rejection escaped unhandled.
    await this.activityService.remove(id);

    return {
      message: 'Activity deleted successfully',
    };
  }
}

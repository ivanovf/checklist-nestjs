import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { ActivityTypeService } from './activity-type.service';
import { CreateActivityTypeDto } from './dto/create-activity-type.dto';
import { UpdateActivityTypeDto } from './dto/update-activity-type.dto';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiRefusals } from '../common/decorators/api-refusals.decorator';
import { ActivityTypeResponseDto } from './dto/activity-type-response.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';

@ApiTags('Activity Type')
@ApiBearerAuth()
@Controller('activity-type')
@Roles(Role.ADMIN)
export class ActivityTypeController {
  constructor(private readonly activityTypeService: ActivityTypeService) {}

  @Post()
  @ApiOperation({ summary: 'Create an activity type' })
  @ApiCreatedResponse({
    type: ActivityTypeResponseDto,
    description: 'The created activity type.',
  })
  @ApiRefusals(400, 401, 403)
  create(@Body() createActivityTypeDto: CreateActivityTypeDto) {
    return this.activityTypeService.create(createActivityTypeDto);
  }

  @Get()
  @ApiOperation({ summary: 'List activity types' })
  @ApiOkResponse({
    type: [ActivityTypeResponseDto],
    description: 'Every activity type, unpaginated (discrepancy D6).',
  })
  @ApiRefusals(401, 403)
  findAll() {
    return this.activityTypeService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an activity type' })
  @ApiOkResponse({
    type: ActivityTypeResponseDto,
    description:
      'The activity type, or an empty body when no record has this id (discrepancy D2).',
  })
  @ApiRefusals(401, 403)
  findOne(@Param('id') id: string) {
    return this.activityTypeService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an activity type' })
  @ApiOkResponse({
    type: ActivityTypeResponseDto,
    description:
      'The updated activity type, or an empty body when no record has this id (discrepancy D2).',
  })
  @ApiRefusals(400, 401, 403)
  update(
    @Param('id') id: string,
    @Body() updateActivityTypeDto: UpdateActivityTypeDto,
  ) {
    return this.activityTypeService.update(id, updateActivityTypeDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an activity type' })
  @ApiOkResponse({
    type: ActivityTypeResponseDto,
    description:
      'The deleted activity type, or an empty body when no record has this id (discrepancy D2).',
  })
  @ApiRefusals(401, 403)
  remove(@Param('id') id: string) {
    return this.activityTypeService.remove(id);
  }
}

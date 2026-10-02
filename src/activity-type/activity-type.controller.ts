import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Query,
  ValidationPipe,
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
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ActivityTypeResponseDto } from './dto/activity-type-response.dto';
import { PaginationQueryDto } from '../filter_dto/pagination-query.dto';
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
    description: 'One page of activity types, oldest first.',
  })
  @ApiRefusals(400, 401, 403)
  findAll(
    // The global pipe validates a copy and hands the handler the raw query, so the paging
    // defaults would never arrive. This pipe passes the converted, defaulted DTO instead. The
    // list used to return its whole collection (D6, specs/011-fix-unbounded-lists).
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: PaginationQueryDto,
  ) {
    return this.activityTypeService.findAll(query.limit, query.offset);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an activity type' })
  @ApiOkResponse({
    type: ActivityTypeResponseDto,
    description: 'The activity type.',
  })
  @ApiRefusals(400, 401, 403, 404)
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.activityTypeService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an activity type' })
  @ApiOkResponse({
    type: ActivityTypeResponseDto,
    description: 'The updated activity type.',
  })
  @ApiRefusals(400, 401, 403, 404)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateActivityTypeDto: UpdateActivityTypeDto,
  ) {
    return this.activityTypeService.update(id, updateActivityTypeDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an activity type' })
  @ApiOkResponse({
    type: ActivityTypeResponseDto,
    description: 'The deleted activity type.',
  })
  @ApiRefusals(400, 401, 403, 404)
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.activityTypeService.remove(id);
  }
}

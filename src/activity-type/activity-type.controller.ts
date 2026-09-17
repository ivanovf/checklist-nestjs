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
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';

@ApiTags('Activity Type')
@Controller('activity-type')
@Roles(Role.ADMIN)
export class ActivityTypeController {
  constructor(private readonly activityTypeService: ActivityTypeService) {}

  @Post()
  create(@Body() createActivityTypeDto: CreateActivityTypeDto) {
    return this.activityTypeService.create(createActivityTypeDto);
  }

  @Get()
  findAll() {
    return this.activityTypeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.activityTypeService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateActivityTypeDto: UpdateActivityTypeDto,
  ) {
    return this.activityTypeService.update(id, updateActivityTypeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.activityTypeService.remove(id);
  }
}

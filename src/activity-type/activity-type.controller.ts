import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ActivityTypeService } from './activity-type.service';
import { CreateActivityTypeDto } from './dto/create-activity-type.dto';
import { UpdateActivityTypeDto } from './dto/update-activity-type.dto';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/auth/models/role.model';

@UseGuards(AuthGuard('jwt'))
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
    return this.activityTypeService.remove(+id);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FilterActivityDto } from './dto/filter-activity.dto';

@UseGuards(AuthGuard('jwt'))
@ApiTags('Activity')
@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Post()
  @ApiResponse({ status: 201, description: 'Activity created successfully' })
  @ApiOperation({ summary: 'Create a new activity' })
  create(@Body() createActivityDto: CreateActivityDto) {
    return this.activityService.create(createActivityDto);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Return all activities' })
  @ApiOperation({ summary: 'Return all activities' })
  findAll(@Query() filterActivityDto: FilterActivityDto) {
    return this.activityService.findAll(filterActivityDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.activityService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateActivityDto: UpdateActivityDto,
  ) {
    return this.activityService.update(id, updateActivityDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    if (this.activityService.remove(id)) {
      return {
        message: 'Activity deleted successfully',
      };
    }
  }
}

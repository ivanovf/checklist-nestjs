import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Patch,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiRefusals } from '../common/decorators/api-refusals.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ConfigResponseDto } from './dto/config-response.dto';
import { ConfigService } from './config.service';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';
import { TankLevelConfigDto } from './dto/tank-level-config.dto';
import { PaginationQueryDto } from '../filter_dto/pagination-query.dto';

@ApiTags('Config')
@ApiBearerAuth()
@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create a device configuration' })
  @ApiCreatedResponse({
    type: ConfigResponseDto,
    description: 'The created configuration.',
  })
  @ApiRefusals(400, 401, 403)
  create(@Body() createConfigDto: CreateConfigDto) {
    return this.configService.create(createConfigDto);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get()
  @ApiOperation({ summary: 'List device configurations' })
  @ApiOkResponse({
    type: [ConfigResponseDto],
    description: 'One page of configurations, oldest first.',
  })
  @ApiRefusals(400, 401)
  findAll(
    // The global pipe validates a copy and hands the handler the raw query, so the paging
    // defaults would never arrive. This pipe passes the converted, defaulted DTO instead. The
    // list used to return its whole collection (D6, specs/011-fix-unbounded-lists).
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: PaginationQueryDto,
  ) {
    return this.configService.findAll(query.limit, query.offset);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  @ApiOperation({ summary: 'Update a device configuration' })
  @ApiOkResponse({
    type: ConfigResponseDto,
    description: 'The updated configuration.',
  })
  @ApiRefusals(400, 401, 403, 404)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateConfigDto: UpdateConfigDto,
  ) {
    return this.configService.update(id, updateConfigDto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Report a tank level from the device (needs a sign-in and the device key in the body)',
  })
  @ApiOkResponse({
    type: ConfigResponseDto,
    description:
      'The updated configuration. A wrong device key is refused with 404 (discrepancy D10).',
  })
  @ApiRefusals(400, 401, 404)
  updateAnalogLecure(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() tankLevelConfigDto: TankLevelConfigDto,
  ) {
    return this.configService.updateAnalogLecure(id, tankLevelConfigDto);
  }
}

import { Controller, Get, Post, Body, Param, Put, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiRefusals } from '../common/decorators/api-refusals.decorator';
import { ConfigResponseDto } from './dto/config-response.dto';
import { ConfigService } from './config.service';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';
import { TankLevelConfigDto } from './dto/tank-level-config.dto';

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
    description: 'Every configuration, unpaginated (discrepancy D6).',
  })
  @ApiRefusals(401)
  findAll() {
    return this.configService.findAll();
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  @ApiOperation({ summary: 'Update a device configuration' })
  @ApiOkResponse({
    type: ConfigResponseDto,
    description:
      'The updated configuration, or an empty body when no record has this id (discrepancy D2).',
  })
  @ApiRefusals(400, 401, 403)
  update(@Param('id') id: string, @Body() updateConfigDto: UpdateConfigDto) {
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
      'The updated configuration, or an empty body when no record has this id (discrepancy D2). A wrong device key is refused with 404 (discrepancy D10).',
  })
  @ApiRefusals(400, 401, 404)
  updateAnalogLecure(
    @Param('id') id: string,
    @Body() tankLevelConfigDto: TankLevelConfigDto,
  ) {
    return this.configService.updateAnalogLecure(id, tankLevelConfigDto);
  }
}

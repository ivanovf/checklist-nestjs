import { Controller, Get, Post, Body, Param, Put, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from './config.service';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';
import { TankLevelConfigDto } from './dto/tank-level-config.dto';

@ApiTags('Config')
@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() createConfigDto: CreateConfigDto) {
    return this.configService.create(createConfigDto);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get()
  findAll() {
    return this.configService.findAll();
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() updateConfigDto: UpdateConfigDto) {
    return this.configService.update(id, updateConfigDto);
  }

  @Patch(':id')
  updateAnalogLecure(
    @Param('id') id: string,
    @Body() tankLevelConfigDto: TankLevelConfigDto,
  ) {
    return this.configService.updateAnalogLecure(id, tankLevelConfigDto);
  }
}

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
import { UsersService } from './users.service';
import { PaginationQueryDto } from '../filter_dto/pagination-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiRefusals } from '../common/decorators/api-refusals.decorator';
import { UserResponseDto } from './dto/user-response.dto';
import { DeletedResponseDto } from '../common/dto/deleted-response.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create an account' })
  @ApiCreatedResponse({
    type: UserResponseDto,
    description: 'The created account. The password is never returned.',
  })
  @ApiRefusals(400, 401, 403)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get('all')
  @ApiOperation({ summary: 'List accounts' })
  @ApiOkResponse({
    type: [UserResponseDto],
    description: 'A page of accounts.',
  })
  @ApiRefusals(400, 401)
  findAll(
    // Paging is optional and bounded by PaginationQueryDto (D1 fixed by
    // specs/007-fix-list-paging-defaults). `whitelist` strips undeclared keys, as on the
    // reservation list; the service never reads them.
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: PaginationQueryDto,
  ) {
    return this.usersService.findAll(query.limit, query.offset);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get(':id')
  @ApiOperation({ summary: 'Get an account' })
  @ApiOkResponse({
    type: UserResponseDto,
    description: 'The account.',
  })
  @ApiRefusals(401, 404)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Put(':id')
  @ApiOperation({
    summary: 'Update an account (every field is required, discrepancy D9)',
  })
  @ApiOkResponse({
    type: UserResponseDto,
    description: 'The updated account.',
  })
  @ApiRefusals(400, 401, 404)
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    //@todo Validate update only own user.
    return this.usersService.update(id, updateUserDto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an account' })
  @ApiOkResponse({
    type: DeletedResponseDto,
    description: 'The account was deleted.',
  })
  @ApiRefusals(401, 403, 404)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}

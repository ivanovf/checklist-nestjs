import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ApiRefusals } from '../common/decorators/api-refusals.decorator';
import { ReservationResponseDto } from './dto/reservation-response.dto';
import { DeletedResponseDto } from '../common/dto/deleted-response.dto';
import { FilterReservationsDto } from '../filter_dto/filter-reservation.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';

@ApiTags('Reservations')
@ApiBearerAuth()
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create a reservation' })
  @ApiCreatedResponse({
    type: ReservationResponseDto,
    description:
      'The created reservation. Refused with 400 when invalid or when the dates are not available.',
  })
  @ApiRefusals(400, 401, 403)
  create(@Body() createReservationDto: CreateReservationDto) {
    return this.reservationsService.create(createReservationDto);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get('all')
  @ApiOperation({ summary: 'List reservations' })
  @ApiOkResponse({
    type: [ReservationResponseDto],
    description: 'Matching reservations.',
  })
  @ApiRefusals(400, 401)
  // Inherited from FilterListDto, which Swagger does not expand from the parent class.
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description:
      'Defaults to 10. Currently refused with 400 whenever supplied (discrepancy D11); omit it.',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description:
      'Defaults to 0. Currently refused with 400 whenever supplied (discrepancy D11); omit it.',
  })
  findAll(@Query() params: FilterReservationsDto) {
    return this.reservationsService.findAll(params);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get(':id')
  @ApiOperation({ summary: 'Get a reservation' })
  @ApiOkResponse({
    type: ReservationResponseDto,
    description:
      'The reservation, or an empty body when no record has this id (discrepancy D2).',
  })
  @ApiRefusals(401)
  findOne(@Param('id') id: string) {
    return this.reservationsService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Put(':id')
  @ApiOperation({ summary: 'Update a reservation' })
  @ApiOkResponse({
    type: ReservationResponseDto,
    description:
      'The updated reservation, or an empty body when no record has this id (discrepancy D2).',
  })
  @ApiRefusals(400, 401)
  update(
    @Param('id') id: string,
    @Body() updateReservationDto: UpdateReservationDto,
  ) {
    return this.reservationsService.update(id, updateReservationDto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a reservation' })
  @ApiOkResponse({
    type: DeletedResponseDto,
    description:
      'Deleted. Also answered for an id that matches no reservation (discrepancy D2).',
  })
  @ApiRefusals(401, 403)
  remove(@Param('id') id: string) {
    return this.reservationsService.remove(id);
  }
}

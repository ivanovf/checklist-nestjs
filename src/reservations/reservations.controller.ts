import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
  ValidationPipe,
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
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { FilterReservationsDto } from '../filter_dto/filter-reservation.dto';
import { MAX_PAGE_SIZE } from '../filter_dto/pagination-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/models/role.model';

/**
 * Converts the reservation list's query for the handler. The global pipe only validates: it
 * converts a copy to check it, then passes the raw strings on, so the DTO's defaults never
 * applied and the list was unbounded (specs/006-fix-reservation-paging, research R1).
 *
 * Scoped to this route because a global `transform` would change the input of every handler
 * in the API (R2). `whitelist` only strips undeclared keys, which the service never reads, so
 * callers see no difference. Refusing them (`forbidNonWhitelisted`) is discrepancy D5.
 */
const listQueryPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  transformOptions: { enableImplicitConversion: true },
});

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
  // Declared by hand for their descriptions. The Swagger plugin does document the inherited
  // PaginationQueryDto properties (specs/007-fix-list-paging-defaults, research R3).
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: {
      type: 'integer',
      minimum: 1,
      maximum: MAX_PAGE_SIZE,
      default: 10,
    },
    description: `Page size, 1–${MAX_PAGE_SIZE}. Defaults to 10. A larger value is refused with 400.`,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    schema: { type: 'integer', minimum: 0, default: 0 },
    description: 'Reservations to skip. Defaults to 0.',
  })
  findAll(@Query(listQueryPipe) params: FilterReservationsDto) {
    return this.reservationsService.findAll(params);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Get(':id')
  @ApiOperation({ summary: 'Get a reservation' })
  @ApiOkResponse({
    type: ReservationResponseDto,
    description: 'The reservation.',
  })
  @ApiRefusals(400, 401, 404)
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.reservationsService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.AUTHENTICATED)
  @Put(':id')
  @ApiOperation({ summary: 'Update a reservation' })
  @ApiOkResponse({
    type: ReservationResponseDto,
    description: 'The updated reservation.',
  })
  @ApiRefusals(400, 401, 404)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateReservationDto: UpdateReservationDto,
  ) {
    return this.reservationsService.update(id, updateReservationDto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a reservation' })
  @ApiOkResponse({
    type: DeletedResponseDto,
    description: 'Deleted.',
  })
  @ApiRefusals(400, 401, 403, 404)
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.reservationsService.remove(id);
  }
}

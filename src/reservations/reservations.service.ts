import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, UpdateQuery } from 'mongoose';
import { FilterReservationsDto } from '../filter_dto/filter-reservation.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { Reservation } from './entities/reservation.entity';
import {
  ReservationResponseDto,
  toReservationResponse,
} from './dto/reservation-response.dto';

/**
 * An empty lock (`''` or `null`) means "no lock", the app's "Ninguna": it is removed rather
 * than stored as an empty value (specs/010-fix-unknown-fields, US3).
 */
function splitLock<T extends { userLock?: string | null }>(dto: T) {
  const { userLock, ...rest } = dto;
  const empty = userLock === '' || userLock === null;
  return { lock: empty ? ('remove' as const) : ('keep' as const), rest };
}

@Injectable()
export class ReservationsService {
  constructor(
    @InjectModel(Reservation.name) private reservationModel: Model<Reservation>,
  ) {}

  // Every answer goes through ReservationResponseDto, embedded items included, so no stored
  // document leaves the service as it is (D3, specs/009-fix-unprojected-records).
  async create(
    createReservationDto: CreateReservationDto,
  ): Promise<ReservationResponseDto> {
    const { lock, rest } = splitLock(createReservationDto);
    const reservation = new this.reservationModel(
      lock === 'remove' ? rest : createReservationDto,
    );
    const checkAvailability = await this.checkAvailability(
      reservation.dateIni,
      reservation.dateEnd,
    );

    if (checkAvailability) {
      throw new BadRequestException('Reservation not available');
    }

    return toReservationResponse(await reservation.save());
  }

  async update(
    id: string,
    updateReservationDto: UpdateReservationDto,
  ): Promise<ReservationResponseDto> {
    // Awaited before the check: an unawaited query is always truthy, so the not-found branch
    // never ran and an unknown id was answered as success (D2, specs/008-fix-unknown-id-404).
    const { lock, rest } = splitLock(updateReservationDto);
    const change: UpdateQuery<Reservation> =
      lock === 'remove'
        ? {
            // `$set` only when something else changes: whether an empty `$set` is accepted
            // depends on the database version.
            ...(Object.keys(rest).length > 0 && { $set: rest }),
            $unset: { userLock: '' },
          }
        : { $set: updateReservationDto };

    const updated = await this.reservationModel
      .findByIdAndUpdate(id, change, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`reservation #${id} not found`);
    }
    return toReservationResponse(updated);
  }

  async remove(id: string) {
    // Reports a deletion only when a record was actually deleted.
    const removed = await this.reservationModel.findByIdAndDelete(id).exec();

    if (!removed) {
      throw new NotFoundException(`reservation #${id} not found`);
    }
    return { deleted: true };
  }

  async findAll(
    params: FilterReservationsDto,
  ): Promise<ReservationResponseDto[]> {
    const { limit, offset, sort, old, validated, dateFrom, dateTo, type } =
      params;
    const todayString = new Date().toISOString().split('T')[0];
    const dir = sort === 'asc' ? 1 : -1;

    const filter: FilterQuery<Reservation> = {
      ...(validated !== undefined && { validated }),
      ...(old && { dateEnd: { $lte: todayString } }),
      ...(dateFrom && { dateIni: { $gte: dateFrom } }),
      ...(dateTo && { dateEnd: { $lte: dateTo } }),
      ...(type && { type }),
    };

    // `_id` breaks ties between reservations that start on the same day. Without it the
    // database may order them differently on each request, and paging would repeat or skip
    // them (specs/006-fix-reservation-paging, research R5).
    const page = await this.reservationModel
      .find(filter)
      .limit(limit)
      .skip(offset)
      .sort({ dateIni: dir, _id: dir })
      .exec();
    return page.map(toReservationResponse);
  }

  async findOne(id: string): Promise<ReservationResponseDto> {
    const found = await this.reservationModel.findById(id).exec();

    if (!found) {
      throw new NotFoundException(`reservation #${id} not found`);
    }
    return toReservationResponse(found);
  }

  async checkAvailability(dateIni: Date, dateEnd: Date) {
    return await this.reservationModel.exists({
      dateIni,
      dateEnd,
    });
  }
}

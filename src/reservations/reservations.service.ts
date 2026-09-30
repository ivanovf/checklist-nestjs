import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { FilterReservationsDto } from '../filter_dto/filter-reservation.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { Reservation } from './entities/reservation.entity';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectModel(Reservation.name) private reservationModel: Model<Reservation>,
  ) {}

  async create(createReservationDto: CreateReservationDto) {
    const reservation = new this.reservationModel(createReservationDto);
    const checkAvailability = await this.checkAvailability(
      reservation.dateIni,
      reservation.dateEnd,
    );

    if (checkAvailability) {
      throw new BadRequestException('Reservation not available');
    }

    return reservation.save();
  }

  async update(id: string, updateReservationDto: UpdateReservationDto) {
    // Awaited before the check: an unawaited query is always truthy, so the not-found branch
    // never ran and an unknown id was answered as success (D2, specs/008-fix-unknown-id-404).
    const updated = await this.reservationModel
      .findByIdAndUpdate(id, { $set: updateReservationDto }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`reservation #${id} not found`);
    }
    return updated;
  }

  async remove(id: string) {
    // Reports a deletion only when a record was actually deleted.
    const removed = await this.reservationModel.findByIdAndDelete(id).exec();

    if (!removed) {
      throw new NotFoundException(`reservation #${id} not found`);
    }
    return { deleted: true };
  }

  findAll(params: FilterReservationsDto) {
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
    return this.reservationModel
      .find(filter)
      .limit(limit)
      .skip(offset)
      .sort({ dateIni: dir, _id: dir });
  }

  async findOne(id: string) {
    const found = await this.reservationModel.findById(id).exec();

    if (!found) {
      throw new NotFoundException(`reservation #${id} not found`);
    }
    return found;
  }

  async checkAvailability(dateIni: Date, dateEnd: Date) {
    return await this.reservationModel.exists({
      dateIni,
      dateEnd,
    });
  }
}

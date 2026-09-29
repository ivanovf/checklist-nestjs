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

  update(id: string, updateReservationDto: UpdateReservationDto) {
    const updated = this.reservationModel
      .findByIdAndUpdate(id, { $set: updateReservationDto }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(id);
    }
    return updated;
  }

  remove(id: string) {
    const removed = this.reservationModel.findByIdAndDelete(id).exec();

    if (!removed) {
      throw new NotFoundException(id);
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

  findOne(id: string) {
    const reservation = this.reservationModel.findById(id);

    if (!reservation) {
      throw new NotFoundException(`reservation #${id} not found`);
    }
    return reservation;
  }

  async checkAvailability(dateIni: Date, dateEnd: Date) {
    return await this.reservationModel.exists({
      dateIni,
      dateEnd,
    });
  }
}

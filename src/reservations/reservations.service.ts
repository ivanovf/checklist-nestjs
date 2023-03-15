import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FilterReservationsDto } from 'src/filter_dto/filter-reservation.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { Reservation } from './entities/reservation.entity';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectModel(Reservation.name) private reservationModel: Model<Reservation>,
  ) {}

  create(createReservationDto: CreateReservationDto) {
    const reservation = new this.reservationModel(createReservationDto);
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
    const { limit, offset, sort, old, validated } = params;
    const today = new Date();

    const filter = {
      dataEnd: {},
      validated: validated,
    };

    if (old) {
      filter.dataEnd = {
        $lte: today.toISOString().split('T')[0],
      };
    }

    return this.reservationModel
      .find(filter)
      .limit(limit)
      .skip(offset)
      .sort({ dateIni: sort === 'desc' ? -1 : 1 });
  }

  findOne(id: string) {
    const reservation = this.reservationModel.findById(id);

    if (!reservation) {
      throw new NotFoundException(`reservation #${id} not found`);
    }
    return reservation;
  }
}

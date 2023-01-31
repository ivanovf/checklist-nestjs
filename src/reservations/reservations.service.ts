import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

  findAll(limit: number, offset: number) {
    return this.reservationModel.find().limit(limit).skip(offset);
  }

  findOne(id: string) {
    const reservation = this.reservationModel.findById(id);

    if (!reservation) {
      throw new NotFoundException(`reservation #${id} not found`);
    }
    return reservation;
  }
}

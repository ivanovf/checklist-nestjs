import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Item, ItemSchema } from '../../items/entities/item.entity';

@Schema({
  timestamps: true,
})
export class Reservation extends Document {
  @Prop({ required: true, type: Date, default: Date.now })
  dateIni: Date;

  @Prop({ required: true, type: Date, default: Date.now })
  dateEnd: Date;

  @Prop({ required: true })
  type: string;

  @Prop({ default: false })
  validated: boolean;

  @Prop({ required: true })
  contact: string;

  @Prop({ required: false })
  userLock: string;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: false })
  cost: number;

  @Prop({ type: [ItemSchema] })
  items: Types.Array<Item>;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);

// Every field the reservation list sorts or filters on is indexed (constitution Principle V;
// specs/006-fix-reservation-paging, research R6). The compound index serves the sort in both
// directions, with `_id` as its tie-break, and the `dateFrom` bound.
ReservationSchema.index({ dateIni: -1, _id: -1 });
ReservationSchema.index({ type: 1 });
ReservationSchema.index({ validated: 1 });
ReservationSchema.index({ dateEnd: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Item, ItemSchema } from 'src/items/entities/item.entity';

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

  @Prop({ type: [ItemSchema] })
  items: Types.Array<Item>;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);

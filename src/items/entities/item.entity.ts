import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Item extends Document {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  status: boolean;

  @Prop()
  description: string;
}

export const ItemSchema = SchemaFactory.createForClass(Item);

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

  @Prop({ required: false, default: false })
  checked: boolean;

  @Prop()
  description: string;

  @Prop({ required: false, default: '' })
  comments: string;

  @Prop({ required: true })
  category: string;
}

export const ItemSchema = SchemaFactory.createForClass(Item);

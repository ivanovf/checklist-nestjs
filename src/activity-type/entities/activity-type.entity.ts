import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class ActivityType extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  budget: number;

  @Prop({ required: false })
  description: string;
}

export const ActivityTypeSchema = SchemaFactory.createForClass(ActivityType);

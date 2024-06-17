import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ActivityType } from 'src/activity-type/entities/activity-type.entity';

@Schema({
  timestamps: true,
})
export class Activity extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'ActivityType' })
  type: ActivityType;

  status: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true, default: Date.now })
  date: Date;

  @Prop({ required: false })
  description: string;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

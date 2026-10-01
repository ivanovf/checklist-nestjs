import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ActivityType } from '../../activity-type/entities/activity-type.entity';
import { ActivityStatus } from './activity-status.enum';

@Schema({
  timestamps: true,
})
export class Activity extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'ActivityType' })
  type: ActivityType;

  @Prop({ required: true, enum: ActivityStatus, default: ActivityStatus.TODO })
  status: ActivityStatus;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true, default: Date.now })
  date: Date;

  @Prop({ required: false })
  description: string;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

// Every field the activity list sorts or filters on is indexed (constitution Principle V;
// specs/011-fix-unbounded-lists, research R5). The compound index serves the sort, newest
// date first with the id as a tie-break.
ActivitySchema.index({ date: -1, _id: -1 });
ActivitySchema.index({ type: 1 });
ActivitySchema.index({ status: 1 });
ActivitySchema.index({ price: 1 });

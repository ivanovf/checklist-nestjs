import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Lock extends Document {
  @Prop({ required: true })
  lock: string;

  @Prop({ required: true })
  userNumber: string;
}

export const LockSchema = SchemaFactory.createForClass(Lock);

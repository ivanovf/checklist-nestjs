import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Config extends Document {
  @Prop({ required: true })
  doorLock: string;

  @Prop({ required: true })
  mainLock: string;

  @Prop({ required: true, default: 20 })
  usersLimit: number;

  @Prop({ required: false, default: 0 })
  analogLecture: number;
}

export const ConfigSchema = SchemaFactory.createForClass(Config);

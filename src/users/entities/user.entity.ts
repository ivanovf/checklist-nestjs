import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

import { Role } from '../../auth/models/role.model';

@Schema({
  timestamps: true,
})
export class User extends Document {
  @Prop({ required: true })
  email: string;

  /**
   * bcrypt hash. Excluded from every query by default so it cannot reach a response through a
   * path that forgot to project it; the two places that legitimately need it — credential
   * verification and the change-password flow — opt back in with `.select('+password')`.
   */
  @Prop({ required: true, select: false })
  password: string;

  @Prop({ required: true })
  name: string;

  /**
   * The sole input to every authorization decision, so it is constrained at the persistence
   * boundary rather than left as a free string. The default is the least-privileged role:
   * an account created without an explicit role must not arrive as an administrator.
   */
  @Prop({
    required: true,
    enum: Object.values(Role),
    default: Role.AUTHENTICATED,
  })
  role: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

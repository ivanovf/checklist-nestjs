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

  /**
   * When the password was last set through recovery. Sessions issued before it are refused
   * (specs/012-password-recovery, FR-013, research R6). Only recovery writes it (R13), and it is
   * excluded from queries by default so it never reaches a user response (D3); the session
   * check opts back in.
   */
  @Prop({ type: Date, select: false })
  passwordChangedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

/**
 * Sign-in and password recovery both look an account up by email (Principle V; research R11).
 * Deliberately not unique: duplicate emails can already exist (D13, #18), and a unique index
 * would fail to build over them. Making it unique belongs to the fix for D13.
 */
UserSchema.index({ email: 1 });

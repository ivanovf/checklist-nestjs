import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * An outstanding password recovery code (specs/012-password-recovery, data-model.md).
 *
 * One document per account: its existence is what "a code is outstanding" means, and issuing
 * again replaces it. The code itself is never stored; only a keyed HMAC of it is, so a copy of
 * the database cannot be brute-forced back into codes without the signing secret (research R3).
 *
 * Expiry and the attempt limit are enforced by the queries that read this document (R4). The
 * TTL index only removes spent documents, since MongoDB's TTL monitor runs about once a minute.
 */
@Schema({ collection: 'passwordrecoveries' })
export class PasswordRecovery extends Document {
  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  codeHash: string;

  @Prop({ type: Types.ObjectId, required: true })
  issuedBy: Types.ObjectId;

  @Prop({ required: true })
  issuedAt: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: true, default: 0 })
  attempts: number;
}

export const PasswordRecoverySchema =
  SchemaFactory.createForClass(PasswordRecovery);

PasswordRecoverySchema.index({ userId: 1 }, { unique: true });
PasswordRecoverySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

import { createHmac, randomInt } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { PasswordRecovery } from '../entities/password-recovery.entity';
import { CompleteRecoveryDto } from '../dto/complete-recovery.dto';
import { UsersService } from '../../users/users.service';

/**
 * The single refusal for every completion that fails on the account or the code: unknown
 * email, no outstanding code, wrong, expired, superseded or used code, account gone. One
 * message, so a caller cannot tell which applied or whether the account exists (FR-012).
 */
export const RECOVERY_REFUSED = 'The recovery code is invalid or has expired.';

const CODE_LIFETIME_MS = 60 * 60 * 1000;

/** Wrong submissions an outstanding code absorbs before it is void (FR-008). */
const MAX_ATTEMPTS = 5;

/** Why a completion was refused. Logged for the operator; never sent to the caller (R10). */
type RefusalReason =
  | 'unknown_account'
  | 'no_outstanding_code'
  | 'wrong_code'
  | 'attempts_exhausted'
  | 'account_gone';

/**
 * Administrator-issued password recovery (specs/012-password-recovery).
 *
 * An administrator issues a 6-digit code for an account and passes it on out-of-band; the
 * holder sets a new password with it. Every state change is one atomic single-document
 * operation on the account's `PasswordRecovery` document (research R4), so the guarantees hold
 * across serverless instances without locks.
 */
@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

  /**
   * Keys the code fingerprints. A 6-digit code has only a million values, so a plain or bcrypt
   * hash of it falls to an offline brute force as soon as the database leaks; an HMAC keyed
   * from the signing secret cannot be reversed without that secret, which lives in the
   * environment, not the database (research R3). Derived rather than used directly, so the
   * same secret never serves two purposes.
   */
  private readonly key: string;

  constructor(
    @InjectModel(PasswordRecovery.name)
    private readonly recoveries: Model<PasswordRecovery>,
    private readonly users: UsersService,
    config: ConfigService,
  ) {
    this.key = createHmac('sha256', config.get<string>('SECRET') ?? '')
      .update('password-recovery-code-v1')
      .digest('hex');
  }

  /**
   * Issues a code for an account, replacing any earlier one (FR-007). The code is returned
   * here once and never stored, so it can never be shown again (FR-002).
   */
  async issue(
    userId: string,
    issuedBy: string,
  ): Promise<{ code: string; expiresAt: Date }> {
    if (!(await this.users.findById(userId))) {
      throw new NotFoundException(`user #${userId} not found`);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + CODE_LIFETIME_MS);

    await this.recoveries
      .updateOne(
        { userId },
        {
          $set: {
            codeHash: this.fingerprint(userId, code),
            issuedBy,
            issuedAt,
            expiresAt,
            attempts: 0,
          },
        },
        { upsert: true },
      )
      .exec();

    this.event('log', 'password_recovery.issued', {
      account: userId,
      issuedBy,
    });
    return { code, expiresAt };
  }

  /**
   * Sets a new password with a code. The account is found exactly as sign-in finds it, so
   * recovery never succeeds for an address that could not sign in (D13 duplicates included).
   *
   * The code is compared inside the delete's filter rather than in memory: the match and the
   * consumption are then one atomic step, so two concurrent completions with the same code
   * cannot both succeed (R4), and there is no comparison to time.
   */
  async complete({
    email,
    code,
    newPassword,
  }: CompleteRecoveryDto): Promise<{ passwordReset: true }> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      return this.refuse('unknown', 'unknown_account');
    }

    const userId = String(user._id);
    // Expiry is enforced here, not left to the TTL index: MongoDB's TTL monitor only runs
    // about once a minute (R4).
    const live = {
      userId,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: MAX_ATTEMPTS },
    };

    const consumed = await this.recoveries
      .findOneAndDelete({ ...live, codeHash: this.fingerprint(userId, code) })
      .exec();
    if (!consumed) {
      // A miss counts against the outstanding code, if there is one. The counter lives in
      // MongoDB, so it holds across serverless instances where the throttle does not (R5).
      const counted = await this.recoveries
        .findOneAndUpdate(live, { $inc: { attempts: 1 } }, { new: true })
        .exec();

      return this.refuse(
        userId,
        !counted
          ? 'no_outstanding_code'
          : counted.attempts >= MAX_ATTEMPTS
            ? 'attempts_exhausted'
            : 'wrong_code',
      );
    }

    if (!(await this.users.resetPassword(userId, newPassword))) {
      return this.refuse(userId, 'account_gone');
    }

    this.event('log', 'password_recovery.completed', { account: userId });
    return { passwordReset: true };
  }

  /** Logs why, then throws the one refusal every cause shares (FR-012). */
  private refuse(account: string, reason: RefusalReason): never {
    this.event('warn', 'password_recovery.refused', { account, reason });
    throw new BadRequestException(RECOVERY_REFUSED);
  }

  /**
   * One structured line per security event, in the shape `RolesGuard` uses (FR-015). Fields
   * are account ids and fixed reasons only: never the code, a password or an email (FR-014).
   */
  private event(
    level: 'log' | 'warn',
    event: string,
    fields: Record<string, string>,
  ): void {
    this.logger[level](
      JSON.stringify({ event, ...fields, timestamp: new Date().toISOString() }),
    );
  }

  /** Binding the account in means a fingerprint copied between accounts never matches. */
  private fingerprint(userId: string, code: string): string {
    return createHmac('sha256', this.key)
      .update(`${userId}:${code}`)
      .digest('hex');
  }
}

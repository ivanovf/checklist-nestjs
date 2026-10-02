import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateBy,
} from 'class-validator';

/**
 * bcrypt silently ignores every byte past the 72nd (research O3, run 2026-10-01), so a longer
 * password would be stored truncated and any password sharing its first 72 bytes would then
 * sign in. Counted in UTF-8 bytes, not characters: 'é' is two.
 */
const MaxBytes = (max: number) =>
  ValidateBy({
    name: 'maxBytes',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= max,
      defaultMessage: () => `newPassword must be at most ${max} bytes`,
    },
  });

/**
 * The body that completes a password recovery (specs/012-password-recovery,
 * contracts/password-recovery.md). Validation runs before the service, so a refused body
 * neither consumes the code nor counts as an attempt (FR-010).
 */
export class CompleteRecoveryDto {
  @ApiProperty({
    description:
      "The account's email address, matched exactly as sign-in matches it.",
    maxLength: 254,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  readonly email: string;

  @ApiProperty({
    description: 'The 6-digit recovery code an administrator issued.',
    pattern: '^\\d{6}$',
    example: '042917',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  readonly code: string;

  @ApiProperty({
    description:
      'The new password: at least 8 characters and at most 72 bytes (UTF-8).',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  @MaxBytes(72)
  readonly newPassword: string;
}

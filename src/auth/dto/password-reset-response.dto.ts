import { ApiProperty } from '@nestjs/swagger';

/**
 * The result of a completed recovery (specs/012-password-recovery). It carries no session:
 * the user signs in with the new password through the normal sign-in (clarification Q2).
 *
 * Documentation only: nothing constructs this class.
 */
export class PasswordResetResponseDto {
  @ApiProperty({ example: true })
  passwordReset: boolean;
}

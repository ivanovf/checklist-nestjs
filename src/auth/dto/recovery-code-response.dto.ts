import { ApiProperty } from '@nestjs/swagger';

/**
 * A freshly issued recovery code (specs/012-password-recovery). The service keeps only a
 * fingerprint of it, so this response is the one and only place the code ever appears.
 *
 * Documentation only: nothing constructs this class.
 */
export class RecoveryCodeResponseDto {
  @ApiProperty({
    description:
      'Six digits, as a string so leading zeros survive. Shown only in this response; pass it to the account holder.',
    example: '042917',
  })
  code: string;

  @ApiProperty({
    description: 'When the code stops working: one hour after it was issued.',
    format: 'date-time',
  })
  expiresAt: string;
}

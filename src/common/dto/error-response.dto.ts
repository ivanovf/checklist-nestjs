import { ApiProperty } from '@nestjs/swagger';

/**
 * The body of every refusal, as Nest's HTTP exceptions send it. Observed from sign-in with a
 * bad password: `{"message":"User or password incorrect.","error":"Unauthorized",
 * "statusCode":401}`. Validation refusals send `message` as a list, one entry per failure.
 *
 * Documentation only: nothing constructs this class, it describes what the service sends.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'User or password incorrect.',
  })
  message: string | string[];

  @ApiProperty({ example: 'Unauthorized' })
  error: string;
}

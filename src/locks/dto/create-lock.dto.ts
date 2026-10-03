import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsDigitalNumber } from '../../validators/digital-number.validator';

export class CreateLockDto {
  // Codes are text: a number is refused, not read as one (D8, specs/014-fix-mistyped-fields).
  @IsString()
  @IsDigitalNumber(10000)
  @IsNotEmpty()
  @ApiProperty()
  readonly lock: string;

  @IsString()
  @IsDigitalNumber(20)
  @IsNotEmpty()
  @ApiProperty()
  readonly userNumber: string;
}

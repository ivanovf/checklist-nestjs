import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';
import { IsDigitalNumber } from 'src/validators/digital-number.validator';

export class CreateLockDto {
  @IsDigitalNumber(10000)
  @IsNotEmpty()
  @ApiProperty()
  readonly lock: string;

  @IsDigitalNumber(20)
  @IsNotEmpty()
  @ApiProperty()
  readonly userNumber: string;
}

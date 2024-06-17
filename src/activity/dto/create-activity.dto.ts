import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsMongoId, IsNumber, IsString } from 'class-validator';

export class CreateActivityDto {
  @ApiProperty()
  @IsMongoId()
  readonly type: string;

  @IsString()
  @ApiProperty()
  readonly status: string;

  @IsNumber()
  @ApiProperty()
  readonly price: number;

  @IsDate()
  @ApiProperty()
  readonly date: Date;

  @IsString()
  @ApiProperty()
  readonly description: string;
}

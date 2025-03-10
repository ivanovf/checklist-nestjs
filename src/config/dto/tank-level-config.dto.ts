import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class TankLevelConfigDto {
  @IsNumber()
  @IsNotEmpty()
  @ApiProperty()
  readonly analogLecture: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  readonly apiKey: string;

  @IsNumber()
  @IsNotEmpty()
  @ApiProperty()
  readonly time: number;
}

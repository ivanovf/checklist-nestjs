import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsNotEmpty } from 'class-validator';

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  readonly label: string;

  @IsBoolean()
  @IsNotEmpty()
  @ApiProperty()
  readonly status: boolean;

  @IsBoolean()
  @ApiProperty()
  readonly checked = false;

  @IsString()
  @ApiProperty()
  readonly description: string;

  @IsString()
  @ApiProperty()
  readonly comments = '';

  @IsString()
  @ApiProperty()
  readonly category: string;
}

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

  @IsString()
  @ApiProperty()
  readonly description: string;
}

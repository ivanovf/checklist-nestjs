import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

import { CreateItemDto } from 'src/items/dto/create-item.dto';

export class CreateReservationDto {
  @IsDate()
  @IsNotEmpty()
  @ApiProperty()
  readonly date: Date;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  readonly type: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  readonly contact: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateItemDto)
  @ApiProperty()
  readonly items: CreateItemDto[];
}

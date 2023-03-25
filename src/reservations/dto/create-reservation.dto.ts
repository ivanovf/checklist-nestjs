import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { CreateItemDto } from 'src/items/dto/create-item.dto';
import { IsDigitalNumber } from 'src/validators/digital-number.validator';

export class CreateReservationDto {
  @IsDate()
  @IsNotEmpty()
  @ApiProperty()
  readonly dateIni: Date;

  @IsDate()
  @IsNotEmpty()
  @ApiProperty()
  readonly dateEnd: Date;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  readonly type: string;

  @IsBoolean()
  @ApiProperty()
  readonly validated: boolean;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  readonly contact: string;

  @IsOptional()
  @IsDigitalNumber(10)
  @ApiProperty()
  readonly lockUser: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateItemDto)
  @ApiProperty()
  readonly items: CreateItemDto[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { IsLockReference } from '../../validators/lock-reference.validator';
import { ReservationItemDto } from './reservation-item.dto';

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

  // Replaces `lockUser`, which was never stored (D15). The mobile app has always sent the
  // lock as `userLock` (specs/010-fix-unknown-fields, research R6).
  @IsOptional()
  @IsLockReference()
  @ApiPropertyOptional({
    description:
      "The assigned lock: a lock code's user slot (e.g. 03), or a lock code's id for older reservations. Empty removes the lock.",
    nullable: true,
  })
  readonly userLock?: string | null;

  @IsNumber()
  @Min(1)
  @Max(8)
  @IsNotEmpty()
  @ApiProperty()
  readonly quantity: number;

  @IsOptional()
  @ApiPropertyOptional()
  readonly cost: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReservationItemDto)
  @ApiProperty()
  readonly items: ReservationItemDto[];
}

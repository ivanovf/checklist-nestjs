import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';
import { Transform, TransformFnParams } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Reads a query flag from its raw string. The global pipe converts implicitly, which turns a
 * Boolean-typed property into a boolean *before* `@Transform` runs, so reading `value` would
 * see `Boolean('false') === true`. The source object still holds what the caller sent. Any
 * value other than 'true' or 'false' is passed through so `@IsBoolean` refuses it.
 */
const toFlag = ({ obj, key }: TransformFnParams): unknown => {
  const raw: unknown = obj[key];

  return raw === 'true' ? true : raw === 'false' ? false : raw;
};

export class FilterReservationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['airbnb', 'booking', 'direct'] })
  @IsOptional()
  @IsString()
  @IsIn(['airbnb', 'booking', 'direct'])
  type: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sort = 'desc';

  @ApiPropertyOptional({
    description:
      'Only past stays. Accepts `true` or `false`; anything else is refused.',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(toFlag)
  old: boolean;

  @ApiPropertyOptional({
    description: 'Accepts `true` or `false`; anything else is refused.',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(toFlag)
  validated: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateFrom: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateTo: string;
}

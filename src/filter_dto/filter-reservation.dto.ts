import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { FilterListDto } from './filter-list.dto';
import { Transform } from 'class-transformer';

export class FilterReservationsDto extends FilterListDto {
  @IsOptional()
  @IsString()
  @IsIn(['airbnb', 'booking', 'direct'])
  type: string;

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sort = 'desc';

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  old: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  validated: boolean;

  @IsOptional()
  @IsDateString()
  dateFrom: string;

  @IsOptional()
  @IsDateString()
  dateTo: string;
}

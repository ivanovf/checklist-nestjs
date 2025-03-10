import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { FilterListDto } from './filter-list.dto';

export class FilterReservationsDto extends FilterListDto {
  @IsString()
  @IsOptional()
  @IsIn(['airbnb', 'booking', 'direct'])
  type: string;

  @IsString()
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort = 'desc';

  @IsBoolean()
  @IsOptional()
  old: boolean;

  @IsBoolean()
  @IsOptional()
  validated: boolean;

  @IsDateString()
  @IsOptional()
  dateFrom: string;

  @IsDateString()
  @IsOptional()
  dateTo: string;
}

import { IsNumber, IsPositive, IsOptional, Min } from 'class-validator';

export class FilterListDto {
  @IsNumber()
  @IsPositive()
  @IsOptional()
  limit: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  offset: number;
}

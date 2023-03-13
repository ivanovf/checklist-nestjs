import { IsNumber, IsPositive, IsOptional, Min } from 'class-validator';

export class FilterListDto {
  @IsNumber()
  @IsPositive()
  @IsOptional()
  limit = 10;

  @IsNumber()
  @Min(0)
  @IsOptional()
  offset = 0;
}

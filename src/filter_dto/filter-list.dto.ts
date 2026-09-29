import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * The largest page a list may return. The constitution requires a hard maximum for every
 * list (Principle V), and a larger request is refused rather than silently cut down
 * (specs/006-fix-reservation-paging, FR-005).
 */
export const MAX_PAGE_SIZE = 50;

/**
 * `limit` and `offset` for the reservation list, as they arrive in a query string.
 *
 * `@Type` converts the strings: the defaults alone gave these properties no runtime type, so
 * implicit conversion left them as strings and every supplied value was refused (D11).
 */
export class FilterListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

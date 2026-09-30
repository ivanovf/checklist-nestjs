import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * The largest page any list may return. The constitution requires a hard maximum for every
 * list (Principle V), and a larger request is refused rather than silently cut down
 * (specs/006-fix-reservation-paging FR-005, specs/007-fix-list-paging-defaults FR-003).
 */
export const MAX_PAGE_SIZE = 50;

/**
 * `limit` and `offset` for every list that pages by position, as they arrive in a query
 * string. The account, item and lock lists use it directly; the reservation list's query
 * extends it.
 *
 * Both are optional with the defaults the contract always described. They used to be
 * required, which refused any request that left one out (discrepancy D1). They also had no
 * range: `limit=0` returned every record, a negative `limit` was reinterpreted by the
 * database, and a negative `offset` was a server error (specs/007-fix-list-paging-defaults).
 *
 * `@Type` converts the query strings. `@ApiPropertyOptional` is explicit because the Swagger
 * plugin marks a property required whenever it is declared without `?`. The TypeScript types
 * stay non-optional, since the defaults guarantee a value.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: 10,
    description: `Page size, 1–${MAX_PAGE_SIZE}. Defaults to 10. A larger value is refused with 400.`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = 10;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    default: 0,
    description: 'Records to skip. Defaults to 0.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

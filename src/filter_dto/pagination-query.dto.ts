import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

/**
 * `limit` and `offset` for the list routes that page by position.
 *
 * Both are required, and deliberately so for now: this replaced per-value `ParseIntPipe`
 * binding (discrepancy D4) without changing any status, and those routes have always refused
 * a request that omits either value (D1). Making them optional with defaults is a behaviour
 * change for a later feature. No range rule is added for the same reason.
 */
export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  limit: number;

  @Type(() => Number)
  @IsInt()
  offset: number;
}

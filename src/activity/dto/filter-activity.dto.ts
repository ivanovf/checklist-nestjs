import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsMongoId, IsOptional } from 'class-validator';
import { ActivityStatus } from '../entities/activity-status.enum';
import { PaginationQueryDto } from '../../filter_dto/pagination-query.dto';

/**
 * The activity list's filters, plus the paging every list shares (`limit` 1–50, default 10;
 * `offset` ≥ 0, default 0). The list used to have no paging at all and returned every
 * matching activity (D6, specs/011-fix-unbounded-lists).
 *
 * The defaults only reach the handler through the route's own converting pipe: the global
 * pipe validates a copy and passes the raw query on (research R1, R3).
 */
export class FilterActivityDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Activity type id.' })
  @IsMongoId()
  @IsOptional()
  readonly type: string;

  @IsEnum(ActivityStatus)
  @ApiPropertyOptional({ enum: ActivityStatus })
  @IsOptional()
  readonly status: ActivityStatus;

  // `@Type` converts the query string here. The global pipe's implicit conversion only ever
  // applied to the copy it validates, and the route pipe does not use it.
  @IsNumber()
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  readonly price: number;
}

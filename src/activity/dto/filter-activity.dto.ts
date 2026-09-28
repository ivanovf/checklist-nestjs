import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsMongoId, IsOptional } from 'class-validator';
import { ActivityStatus } from '../entities/activity-status.enum';

export class FilterActivityDto {
  @ApiPropertyOptional({ description: 'Activity type id.' })
  @IsMongoId()
  @IsOptional()
  readonly type: string;

  @IsEnum(ActivityStatus)
  @ApiPropertyOptional({ enum: ActivityStatus })
  @IsOptional()
  readonly status: ActivityStatus;

  @IsNumber()
  @ApiPropertyOptional()
  @IsOptional()
  readonly price: number;
}

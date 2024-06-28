import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsMongoId, IsOptional } from 'class-validator';
import { ActivityStatus } from '../entities/activity-status.enum';

export class FilterActivityDto {
  @ApiProperty()
  @IsMongoId()
  @IsOptional()
  readonly type: string;

  @IsEnum(ActivityStatus)
  @ApiProperty({
    enum: ActivityStatus,
    default: ActivityStatus.TODO,
  })
  @IsOptional()
  readonly status: ActivityStatus;

  @IsNumber()
  @ApiProperty()
  @IsOptional()
  readonly price: number;
}

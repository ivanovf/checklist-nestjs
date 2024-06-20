import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsEnum, IsMongoId, IsNumber, IsString } from 'class-validator';
import { ActivityStatus } from '../entities/activity-status.enum';

export class CreateActivityDto {
  @ApiProperty()
  @IsMongoId()
  readonly type: string;

  @IsEnum(ActivityStatus)
  @ApiProperty({
    enum: ActivityStatus,
    default: ActivityStatus.TODO,
  })
  readonly status: ActivityStatus;

  @IsNumber()
  @ApiProperty()
  readonly price: number;

  @IsDate()
  @ApiProperty()
  readonly date: Date;

  @IsString()
  @ApiProperty()
  readonly description: string;
}

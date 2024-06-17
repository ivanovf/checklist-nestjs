import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateActivityTypeDto {
  @IsString()
  @ApiProperty()
  readonly name: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  readonly budget: number;

  @IsString()
  @ApiProperty()
  @IsOptional()
  readonly description: string;
}

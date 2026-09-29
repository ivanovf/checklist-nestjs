import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

import { Role } from '../../auth/models/role.model';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  readonly email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  readonly name: string;

  // Only these values are stored; anything else is currently a 500 (discrepancy D12).
  @ApiProperty({ enum: Role })
  @IsString()
  readonly role: string;
}

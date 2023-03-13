import { IsBoolean, IsString } from 'class-validator';

export class UpdatePassUserDto {
  @IsString()
  readonly password: string;

  @IsBoolean()
  readonly changePassword: boolean;

  @IsString()
  readonly currentPassword: string;
}

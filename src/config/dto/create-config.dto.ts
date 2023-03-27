import { IsNumber, IsString } from 'class-validator';

export class CreateConfigDto {
  @IsString()
  readonly doorLock: string;

  @IsString()
  readonly mainLock: string;

  @IsNumber()
  readonly usersLimit: number;
}

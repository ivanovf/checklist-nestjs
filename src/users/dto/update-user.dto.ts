import { IntersectionType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { UpdatePassUserDto } from './update-pass-user.dto';

export class UpdateUserDto extends IntersectionType(
  CreateUserDto,
  UpdatePassUserDto,
) {}

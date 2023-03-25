import { PartialType } from '@nestjs/swagger';
import { CreateLockDto } from './create-lock.dto';

export class UpdateLockDto extends PartialType(CreateLockDto) {}

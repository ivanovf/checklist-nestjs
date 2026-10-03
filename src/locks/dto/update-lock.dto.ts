import { PartialType } from '@nestjs/swagger';
import { CreateLockDto } from './create-lock.dto';

// An omitted field is skipped, but a `null` one is checked as on create (D8, spec 014 R5).
export class UpdateLockDto extends PartialType(CreateLockDto, {
  skipNullProperties: false,
}) {}

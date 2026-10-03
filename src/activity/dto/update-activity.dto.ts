import { PartialType } from '@nestjs/swagger';
import { CreateActivityDto } from './create-activity.dto';

// An omitted field is skipped, but a `null` one is checked as on create (D8, spec 014 R5).
export class UpdateActivityDto extends PartialType(CreateActivityDto, {
  skipNullProperties: false,
}) {}

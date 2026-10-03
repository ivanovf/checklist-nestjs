import { PartialType } from '@nestjs/swagger';
import { CreateActivityTypeDto } from './create-activity-type.dto';

// An omitted field is skipped, but a `null` one is checked as on create (D8, spec 014 R5).
export class UpdateActivityTypeDto extends PartialType(CreateActivityTypeDto, {
  skipNullProperties: false,
}) {}

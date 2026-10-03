import { PartialType } from '@nestjs/swagger';
import { CreateConfigDto } from './create-config.dto';

// An omitted field is skipped, but a `null` one is checked as on create (D8, spec 014 R5).
export class UpdateConfigDto extends PartialType(CreateConfigDto, {
  skipNullProperties: false,
}) {}

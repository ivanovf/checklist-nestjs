import { PartialType } from '@nestjs/swagger';
import { CreateItemDto } from './create-item.dto';

// An omitted field is skipped, but a `null` one is checked as on create (D8, spec 014 R5).
export class UpdateItemDto extends PartialType(CreateItemDto, {
  skipNullProperties: false,
}) {}

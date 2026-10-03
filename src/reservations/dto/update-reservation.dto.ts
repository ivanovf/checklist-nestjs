import { PartialType } from '@nestjs/swagger';
import { CreateReservationDto } from './create-reservation.dto';

// An omitted field is skipped, but a `null` one is checked as on create (D8, spec 014 R5).
export class UpdateReservationDto extends PartialType(CreateReservationDto, {
  skipNullProperties: false,
}) {}

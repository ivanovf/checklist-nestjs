import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';

import { CreateItemDto } from '../../items/dto/create-item.dto';

/**
 * A checklist entry inside a reservation (specs/010-fix-unknown-fields, research R5).
 *
 * The mobile app sends each entry's `_id` back when it saves a reservation, so entries keep
 * their identity across saves, as they did before undeclared fields were refused. This is an
 * embedded entry's id, not a record's: `POST /api/items` still refuses `_id`.
 */
export class ReservationItemDto extends CreateItemDto {
  @IsOptional()
  @IsMongoId()
  @ApiPropertyOptional({
    description: "The checklist entry's id; keeps it across saves.",
  })
  readonly _id?: string;
}

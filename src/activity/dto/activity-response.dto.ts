import { ApiProperty } from '@nestjs/swagger';

import { FieldList, project } from '../../common/projection';
import {
  ActivityTypeResponseDto,
  toActivityTypeResponse,
} from '../../activity-type/dto/activity-type-response.dto';
import { ActivityStatus } from '../entities/activity-status.enum';

/**
 * An activity as reads answer it, with its type populated. The service projects each record
 * through this shape, the populated type included, so only these fields leave it (D3,
 * specs/009-fix-unprojected-records).
 */
export class ActivityResponseDto {
  _id: string;

  /**
   * The activity's type, populated as the full record. `null` once that activity type has been
   * deleted (observed 2026-10-01).
   */
  @ApiProperty({ type: () => ActivityTypeResponseDto, nullable: true })
  type: ActivityTypeResponseDto | null;

  status: ActivityStatus;

  price: number;

  date: Date;

  description?: string;

  createdAt: Date;

  updatedAt: Date;
}

/**
 * An activity as create and update answer it: `type` is the activity type's id, not the
 * populated record that reads return (observed).
 */
export class ActivityRecordResponseDto {
  _id: string;

  /** The activity type's id. */
  type: string;

  status: ActivityStatus;

  price: number;

  date: Date;

  description?: string;

  createdAt: Date;

  updatedAt: Date;
}

/** What deleting an activity answers (observed). */
export class ActivityDeletedResponseDto {
  message: string;
}

export const ACTIVITY_RESPONSE_FIELDS: FieldList<ActivityResponseDto> = {
  _id: true,
  type: true,
  status: true,
  price: true,
  date: true,
  description: true,
  createdAt: true,
  updatedAt: true,
};

export const ACTIVITY_RECORD_RESPONSE_FIELDS: FieldList<ActivityRecordResponseDto> =
  ACTIVITY_RESPONSE_FIELDS;

export function toActivityResponse(activity: object): ActivityResponseDto {
  const answer = project<ActivityResponseDto>(
    activity,
    ACTIVITY_RESPONSE_FIELDS,
  );
  const type = (activity as { type?: object | null }).type;

  return { ...answer, type: type ? toActivityTypeResponse(type) : null };
}

export function toActivityRecordResponse(
  activity: object,
): ActivityRecordResponseDto {
  const answer = project<ActivityRecordResponseDto>(
    activity,
    ACTIVITY_RECORD_RESPONSE_FIELDS,
  );

  // The stored type is an ObjectId; it is answered as its id string.
  return answer.type === undefined
    ? answer
    : { ...answer, type: String(answer.type) };
}

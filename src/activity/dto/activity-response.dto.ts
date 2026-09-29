import { ActivityTypeResponseDto } from '../../activity-type/dto/activity-type-response.dto';
import { ActivityStatus } from '../entities/activity-status.enum';

/**
 * Documentation only: describes the stored record exactly as the service returns it
 * (observed 2026-09-28), internal fields included (discrepancy D3). Nothing constructs it.
 */
export class ActivityResponseDto {
  _id: string;

  /** The activity's type, populated as the full record. */
  type: ActivityTypeResponseDto;

  status: ActivityStatus;

  price: number;

  date: Date;

  description?: string;

  createdAt: Date;

  updatedAt: Date;

  __v: number;
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

  __v: number;
}

/** What deleting an activity answers (observed). */
export class ActivityDeletedResponseDto {
  message: string;
}

import { FieldList, project } from '../../common/projection';

/**
 * The activity type as every operation answers it: the service projects each record through this
 * shape, so only these fields leave it (D3, specs/009-fix-unprojected-records).
 */
export class ActivityTypeResponseDto {
  _id: string;

  name: string;

  budget: number;

  description?: string;

  createdAt: Date;

  updatedAt: Date;
}

export const ACTIVITY_TYPE_RESPONSE_FIELDS: FieldList<ActivityTypeResponseDto> =
  {
    _id: true,
    name: true,
    budget: true,
    description: true,
    createdAt: true,
    updatedAt: true,
  };

export function toActivityTypeResponse(
  activityType: object,
): ActivityTypeResponseDto {
  return project<ActivityTypeResponseDto>(
    activityType,
    ACTIVITY_TYPE_RESPONSE_FIELDS,
  );
}

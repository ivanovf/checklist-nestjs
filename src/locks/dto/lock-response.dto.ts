import { FieldList, project } from '../../common/projection';

/**
 * The lock code as every operation answers it: the service projects each record through this
 * shape, so only these fields leave it (D3, specs/009-fix-unprojected-records).
 */
export class LockResponseDto {
  _id: string;

  lock: string;

  userNumber: string;

  createdAt: Date;

  updatedAt: Date;
}

export const LOCK_RESPONSE_FIELDS: FieldList<LockResponseDto> = {
  _id: true,
  lock: true,
  userNumber: true,
  createdAt: true,
  updatedAt: true,
};

export function toLockResponse(lock: object): LockResponseDto {
  return project<LockResponseDto>(lock, LOCK_RESPONSE_FIELDS);
}

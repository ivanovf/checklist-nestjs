import { FieldList, project } from '../../common/projection';
import { Role } from '../../auth/models/role.model';

/**
 * The account as every operation answers it: the service projects each record through this
 * shape, so only these fields leave it (D3, specs/009-fix-unprojected-records).
 */
export class UserResponseDto {
  _id: string;

  email: string;

  name: string;

  role: Role;

  createdAt: Date;

  updatedAt: Date;
}

export const USER_RESPONSE_FIELDS: FieldList<UserResponseDto> = {
  _id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
};

export function toUserResponse(user: object): UserResponseDto {
  return project<UserResponseDto>(user, USER_RESPONSE_FIELDS);
}

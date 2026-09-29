import { Role } from '../../auth/models/role.model';

/**
 * Documentation only: describes the stored record exactly as the service returns it
 * (observed 2026-09-28), internal fields included (discrepancy D3). Nothing constructs it.
 */
export class UserResponseDto {
  _id: string;

  email: string;

  name: string;

  role: Role;

  createdAt: Date;

  updatedAt: Date;

  __v: number;
}

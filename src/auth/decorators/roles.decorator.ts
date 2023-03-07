import { SetMetadata } from '@nestjs/common';
import { Role } from '../models/role.model';

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

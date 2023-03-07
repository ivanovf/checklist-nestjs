import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { Role } from '../models/role.model';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const roles = this.reflector.get<Role[]>('roles', context.getHandler());

    if (!roles) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const userToken = request.user;
    console.log(roles);

    const isAuth = roles.some((role) => role === userToken.role);

    if (!isAuth) {
      console.log('A user without admin role tried to use an endpoint.');

      throw new UnauthorizedException('You are not authorized to this page.')
    }

    return true;
  }
}

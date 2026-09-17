import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '../models/role.model';

export const ROLES_KEY = 'roles';

const VALID_ROLES: string[] = Object.values(Role);

/**
 * Enforces the role a route declares.
 *
 * Registered application-wide, so it runs for every request rather than only where a
 * controller remembered to opt in. It runs after authentication, which means `request.user`
 * is populated by the time this reads it — except on a route that bypassed authentication,
 * which is why an absent user denies rather than throws.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Handler AND class: a controller may declare @Roles once for all of its routes.
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No declaration means the route is open to any authenticated caller. Authentication has
    // already run, so this is not a bypass. Whether every route *should* declare a role is
    // enforced by the authorization-matrix contract test, which is a clearer failure than a
    // runtime denial.
    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    if (!user) {
      this.deny(request, undefined, 'no authenticated user on the request');
    }

    const role = user.role;

    // An unknown, absent, or empty role must never be treated as permissible.
    if (!role || !VALID_ROLES.includes(role)) {
      this.deny(
        request,
        user,
        `role ${JSON.stringify(role)} is not recognised`,
      );
    }

    if (!roles.includes(role)) {
      this.deny(request, user, `role ${role} is not permitted here`);
    }

    return true;
  }

  /** Records the refusal, then denies. Never logs credentials or request bodies. */
  private deny(
    request: { method?: string; url?: string } | undefined,
    user: { email?: string; id?: string } | undefined,
    reason: string,
  ): never {
    this.logger.warn(
      JSON.stringify({
        event: 'authorization.denied',
        account: user?.email ?? user?.id ?? 'anonymous',
        method: request?.method,
        path: request?.url,
        reason,
        timestamp: new Date().toISOString(),
      }),
    );

    throw new ForbiddenException('You are not authorized to this page.');
  }
}

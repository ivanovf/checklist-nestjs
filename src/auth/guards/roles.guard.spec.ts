import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RolesGuard } from './roles.guard';
import { Role } from '../models/role.model';

/**
 * These cover the three fail-open shapes that made the guard unsafe to register globally:
 * class-level metadata invisible to a handler-only lookup, an absent `request.user`, and a
 * role that is not a member of the enum.
 */
describe('RolesGuard', () => {
  const contextFor = (user: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user, method: 'GET', url: '/api/test' }),
      }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    }) as unknown as ExecutionContext;

  const guardWith = (roles: Role[] | undefined) => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
    return { guard: new RolesGuard(reflector), reflector };
  };

  it('reads metadata from the handler AND the class', () => {
    // ActivityTypeController declares @Roles at class level; a handler-only lookup returns
    // undefined for all five of its routes and the guard would let every caller through.
    const { guard, reflector } = guardWith([Role.ADMIN]);

    guard.canActivate(contextFor({ role: Role.ADMIN }));

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      'roles',
      expect.arrayContaining([expect.anything(), expect.anything()]),
    );
  });

  it('allows a caller whose role is listed', () => {
    const { guard } = guardWith([Role.ADMIN, Role.AUTHENTICATED]);

    expect(guard.canActivate(contextFor({ role: Role.AUTHENTICATED }))).toBe(
      true,
    );
  });

  it('denies a caller whose role is not listed', () => {
    const { guard } = guardWith([Role.ADMIN]);

    expect(() =>
      guard.canActivate(contextFor({ role: Role.AUTHENTICATED })),
    ).toThrow(ForbiddenException);
  });

  it('denies when the request carries no user', () => {
    const { guard } = guardWith([Role.ADMIN]);

    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('denies a role that is not a member of the enum', () => {
    const { guard } = guardWith([Role.ADMIN]);

    expect(() => guard.canActivate(contextFor({ role: 'superuser' }))).toThrow(
      ForbiddenException,
    );
  });

  it('denies an absent or empty role', () => {
    const { guard } = guardWith([Role.AUTHENTICATED]);

    expect(() => guard.canActivate(contextFor({ role: '' }))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(contextFor({}))).toThrow(ForbiddenException);
  });

  it('allows a route that declares no roles, having already passed authentication', () => {
    const { guard } = guardWith(undefined);

    expect(guard.canActivate(contextFor({ role: Role.AUTHENTICATED }))).toBe(
      true,
    );
  });
});

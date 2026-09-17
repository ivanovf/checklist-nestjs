import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

describe('JwtAuthGuard', () => {
  const context = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as unknown as ExecutionContext;

  it('bypasses authentication for a route marked @Public', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const guard = new JwtAuthGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      expect.any(Array),
    );
  });

  it('requires authentication when the route is not marked public', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const guard = new JwtAuthGuard(reflector);
    // Delegates to the passport strategy rather than short-circuiting to true.
    const delegated = jest
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
      .mockReturnValue('delegated' as never);

    expect(guard.canActivate(context)).toBe('delegated');
    expect(delegated).toHaveBeenCalledWith(context);
  });
});

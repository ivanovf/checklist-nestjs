import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { ApiKeyGuard } from './api-key.guard';

/**
 * The guard reads a single header and compares it to a hard-coded value. Both outcomes are
 * covered so the deny path cannot regress into a silent allow.
 */
describe('ApiKeyGuard', () => {
  const contextFor = (auth?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ header: () => auth }),
      }),
    }) as unknown as ExecutionContext;

  it('allows a request carrying the expected key', () => {
    expect(new ApiKeyGuard().canActivate(contextFor('mytoken'))).toBe(true);
  });

  it('refuses a request with the wrong key', () => {
    expect(() => new ApiKeyGuard().canActivate(contextFor('wrong'))).toThrow(
      UnauthorizedException,
    );
  });

  it('refuses a request with no key at all', () => {
    expect(() => new ApiKeyGuard().canActivate(contextFor())).toThrow(
      UnauthorizedException,
    );
  });
});

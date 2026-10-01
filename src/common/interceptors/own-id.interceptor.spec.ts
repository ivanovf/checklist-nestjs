import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';

import { OwnIdInterceptor } from './own-id.interceptor';

/**
 * A change may repeat its own record's id in the body (specs/010-fix-unknown-fields,
 * research R4). The mobile app sends `_id` on every edit, so the matching value is dropped
 * before validation, and any other value is refused.
 */
describe('OwnIdInterceptor', () => {
  const ID = '64b000000000000000000001';
  const interceptor = new OwnIdInterceptor();

  const context = (params: Record<string, string>, body: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ params, body }) }),
    }) as unknown as ExecutionContext;

  let next: CallHandler & { handle: jest.Mock };

  beforeEach(() => {
    next = { handle: jest.fn().mockReturnValue(of('ok')) };
  });

  const run = (params: Record<string, string>, body: unknown) =>
    lastValueFrom(interceptor.intercept(context(params, body), next));

  it('drops a body _id that equals the path id', async () => {
    const body = { _id: ID, label: 'x' };

    await expect(run({ id: ID }, body)).resolves.toBe('ok');
    expect(body).toStrictEqual({ label: 'x' });
  });

  it('refuses a body _id that differs from the path id', () => {
    const body = { _id: '64b000000000000000000002', label: 'x' };

    expect(() =>
      interceptor.intercept(context({ id: ID }, body), next),
    ).toThrow(new BadRequestException(['_id must match the id in the path']));
    expect(next.handle).not.toHaveBeenCalled();
    expect(body._id).toBe('64b000000000000000000002');
  });

  it('leaves a create alone, for validation to refuse its _id', async () => {
    const body = { _id: ID, label: 'x' };

    await expect(run({}, body)).resolves.toBe('ok');
    expect(body).toStrictEqual({ _id: ID, label: 'x' });
  });

  it('leaves a body without _id alone', async () => {
    const body = { label: 'x' };

    await expect(run({ id: ID }, body)).resolves.toBe('ok');
    expect(body).toStrictEqual({ label: 'x' });
  });

  it.each([undefined, null, [{ _id: 'x' }], 'text'])(
    'leaves a non-object body (%p) alone',
    async (body) => {
      await expect(run({ id: ID }, body)).resolves.toBe('ok');
    },
  );
});

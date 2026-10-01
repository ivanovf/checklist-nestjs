import 'reflect-metadata';
import { validate } from 'class-validator';

import { IsLockReference } from './lock-reference.validator';

class Probe {
  @IsLockReference()
  userLock?: unknown;
}

/**
 * A reservation's lock (specs/010-fix-unknown-fields, research R6). The mobile app stores a
 * lock code's user slot (`"03"`). Older reservations hold a lock code's id. An empty value
 * means "no lock".
 *
 * The slot uses a lock code's own `userNumber` rule (`IsDigitalNumber(20)`), leniency
 * included: it reads the leading number, so `"3abc"` passes there too.
 */
describe('IsLockReference', () => {
  const errors = async (value: unknown) => {
    const probe = new Probe();
    probe.userLock = value;
    return validate(probe);
  };

  it.each(['03', '0', '19', '64b000000000000000000001', '', null, undefined])(
    'accepts %p',
    async (value) => {
      expect(await errors(value)).toHaveLength(0);
    },
  );

  it.each(['20', 'ul', '64b0', 5])('refuses %p', async (value) => {
    const [error] = await errors(value);

    expect(error.constraints).toStrictEqual({
      isLockReference: 'userLock must be a lock user slot (0–19) or a lock id',
    });
  });
});

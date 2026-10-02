import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CompleteRecoveryDto } from './complete-recovery.dto';

/**
 * The completion body's rules (specs/012-password-recovery, FR-010, research R9). The byte
 * limit matters most: bcrypt ignores everything past byte 72, so it is counted in UTF-8 bytes,
 * not characters.
 */
describe('CompleteRecoveryDto', () => {
  const valid = {
    email: 'guest@test.local',
    code: '042917',
    newPassword: 'a new passphrase',
  };

  const failing = async (override: Record<string, unknown>) =>
    (
      await validate(
        plainToInstance(CompleteRecoveryDto, { ...valid, ...override }),
      )
    ).map((error) => error.property);

  it('accepts a valid body', async () => {
    expect(await failing({})).toEqual([]);
  });

  it.each([
    ['72 one-byte characters', 'a'.repeat(72), []],
    ['73 one-byte characters', 'a'.repeat(73), ['newPassword']],
    ['36 two-byte characters (72 bytes)', 'é'.repeat(36), []],
    ['37 two-byte characters (74 bytes)', 'é'.repeat(37), ['newPassword']],
    ['7 characters', 'short12', ['newPassword']],
    ['a non-string', 12345678, ['newPassword']],
  ])('newPassword of %s', async (_case, newPassword, expected) => {
    expect(await failing({ newPassword })).toEqual(expected);
  });

  it.each(['12345', '1234567', '12a456', ' 123456'])(
    'refuses the code %j',
    async (code) => {
      expect(await failing({ code })).toEqual(['code']);
    },
  );

  it('refuses an empty email', async () => {
    expect(await failing({ email: '' })).toEqual(['email']);
  });
});

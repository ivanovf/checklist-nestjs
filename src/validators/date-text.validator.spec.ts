import 'reflect-metadata';
import { validate } from 'class-validator';

import { IsDateText } from './date-text.validator';

class Probe {
  @IsDateText()
  date?: unknown;
}

/**
 * A date in a request body (specs/014-fix-mistyped-fields, research R3). JSON has no date
 * kind, so clients send dates as text. Only strict ISO 8601 text that is a real date passes:
 * a number, a yes/no or an impossible date is refused instead of being converted.
 */
describe('IsDateText', () => {
  const errors = async (value: unknown) => {
    const probe = new Probe();
    probe.date = value;
    return validate(probe);
  };

  it.each([
    '2026-01-01',
    '2026-01-01T00:00:00.000',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T10:00:00-05:00',
  ])('accepts %p', async (value) => {
    expect(await errors(value)).toHaveLength(0);
  });

  it.each([
    7,
    true,
    null,
    {},
    [],
    '',
    'not-a-date',
    '2026-02-30',
    '2026-13-01',
    // Strict ISO 8601, but not a form `Date` can read: storage would fail on them.
    '20260101',
    '2026-W01',
  ])('refuses %p', async (value) => {
    const [error] = await errors(value);

    expect(error.constraints).toStrictEqual({
      isDateText: 'date must be a date in ISO 8601 format',
    });
  });
});

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { FilterReservationsDto } from './filter-reservation.dto';

/**
 * The reservation list's query, converted with the same options as the global
 * ValidationPipe (`src/bootstrap.ts`). The flags must mean what their raw value says whether
 * or not implicit conversion runs first (specs/006-fix-reservation-paging, research R4).
 */
describe('FilterReservationsDto', () => {
  const convert = (query: object, implicit = true) =>
    plainToInstance(FilterReservationsDto, query, {
      enableImplicitConversion: implicit,
    });
  const invalid = (query: object) =>
    validateSync(convert(query)).map((error) => error.property);

  describe.each([true, false])('implicit conversion %s', (implicit) => {
    it.each([
      ['validated', 'true', true],
      ['validated', 'false', false],
      ['old', 'true', true],
      ['old', 'false', false],
    ] as const)('%s=%s becomes %s', (key, raw, expected) => {
      expect(convert({ [key]: raw }, implicit)[key]).toBe(expected);
    });
  });

  it.each([
    ['old', 'yes'],
    ['validated', '1'],
  ])('refuses %s=%s', (key, raw) => {
    expect(invalid({ [key]: raw })).toEqual([key]);
  });

  it('defaults to descending order and leaves the flags unset', () => {
    const dto = convert({});

    expect(dto.sort).toBe('desc');
    expect(dto.old).toBeUndefined();
    expect(dto.validated).toBeUndefined();
    expect(invalid({})).toEqual([]);
  });
});

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { FilterListDto } from './filter-list.dto';

/**
 * Paging values as they arrive in a query string: strings, converted with the global
 * ValidationPipe's options (specs/006-fix-reservation-paging, FR-001–FR-005).
 */
describe('FilterListDto', () => {
  const convert = (query: object) =>
    plainToInstance(FilterListDto, query, { enableImplicitConversion: true });
  const errorsOf = (query: object) => validateSync(convert(query));

  it('defaults to a page of 10 from the start', () => {
    expect(convert({})).toMatchObject({ limit: 10, offset: 0 });
    expect(errorsOf({})).toEqual([]);
  });

  it.each([
    [
      { limit: '5', offset: '0' },
      { limit: 5, offset: 0 },
    ],
    [{ limit: '1' }, { limit: 1, offset: 0 }],
    [{ limit: '50' }, { limit: 50, offset: 0 }],
    [{ offset: '7' }, { limit: 10, offset: 7 }],
    [{ limit: '010' }, { limit: 10, offset: 0 }],
  ])('accepts %j as numbers', (query, expected) => {
    expect(convert(query)).toMatchObject(expected);
    expect(errorsOf(query)).toEqual([]);
  });

  it.each([
    ['limit', '0'],
    ['limit', '-1'],
    ['limit', '2.5'],
    ['limit', 'abc'],
    ['limit', '51'],
    ['limit', '200'],
    ['limit', ''],
    ['limit', ['5', '7']],
    ['offset', '-1'],
    ['offset', '2.5'],
    ['offset', 'abc'],
    ['offset', ['0', '1']],
  ])('refuses %s=%j', (key, raw) => {
    expect(errorsOf({ [key]: raw }).map((error) => error.property)).toEqual([
      key,
    ]);
  });

  it('names the maximum when the page is too large', () => {
    const [error] = errorsOf({ limit: '51' });

    expect(Object.values(error.constraints ?? {}).join(' ')).toContain('50');
  });
});

import { BadRequestException } from '@nestjs/common';

import { ParseObjectIdPipe } from './parse-object-id.pipe';

/**
 * A malformed record id used to reach the database and fail there as a server error, or as a
 * false `{ deleted: true }` on three DELETE routes (D7, specs/008-fix-unknown-id-404).
 */
describe('ParseObjectIdPipe', () => {
  const pipe = new ParseObjectIdPipe();

  it.each(['6aba80d38c58c96b58020000', '6ABA80D38C58C96B58020000'])(
    'passes %s through unchanged',
    (id) => {
      expect(pipe.transform(id)).toBe(id);
    },
  );

  it.each([
    'abc',
    '',
    '123456789012', // 12 characters: ObjectId.isValid accepts it as raw bytes
    'zzzzzzzzzzzzzzzzzzzzzzzz',
    '6aba80d38c58c96b5802000', // 23 hex characters
  ])('refuses %j as a bad request', (id) => {
    expect(() => pipe.transform(id)).toThrow(
      new BadRequestException(`Invalid id "${id}"`),
    );
  });
});

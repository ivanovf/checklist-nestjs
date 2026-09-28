import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { createTestApp } from '../security/app-factory';
import { seedAccounts, tokenFor } from '../support/auth-fixtures';

/**
 * D4 (specs/005-openapi-contract-export/discrepancies.md): `limit` and `offset` were bound
 * one by one with `ParseIntPipe` instead of through a typed query DTO. Replacing that
 * binding must not change what any caller sees, so these tests pin today's statuses,
 * including D1, both values being required despite the defaults written in the code.
 *
 * Written against the ParseIntPipe binding and kept green through the change.
 */
const LIST_ROUTES = ['/api/users/all', '/api/items/all', '/api/locks/all'];

const CASES: Array<[query: string, status: number]> = [
  ['limit=10&offset=0', 200],
  ['offset=0', 400],
  ['limit=10', 400],
  ['', 400],
  ['limit=abc&offset=0', 400],
  ['limit=10&offset=abc', 400],
  ['limit=2.5&offset=0', 400],
];

describe('Pagination query binding (D4)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp({ transport: true });
    const { guest } = await seedAccounts(app);
    token = await tokenFor(app, guest);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe.each(LIST_ROUTES)('GET %s', (route) => {
    it.each(CASES)('?%s answers %i', async (query, status) => {
      await request(app.getHttpServer())
        .get(query ? `${route}?${query}` : route)
        .set('Authorization', `Bearer ${token}`)
        .expect(status);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { createTestApp } from './app-factory';

/**
 * User Story 1 — a deploy can be confirmed genuinely healthy.
 *
 * The health route is the only thing a deploy check can rely on, so it must answer without a
 * credential under default-deny authorization. The unknown-path case is here too (FR-004):
 * a request that matches no route has to be answered by the application, not absorbed by the
 * platform's static file lookup.
 */
describe('Health endpoint (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('is reachable with no credential and reports the data store as available', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200, { status: 'ok', database: 'up' });
  });

  it('answers not found for a path the application does not define', async () => {
    await request(app.getHttpServer()).get('/api/not-a-real-route').expect(404);
  });

  it('does not disclose connection detail on the health route', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');

    expect(Object.keys(response.body)).toEqual(['status', 'database']);
    expect(JSON.stringify(response.body)).not.toMatch(
      /mongodb|password|@|cluster/i,
    );
  });
});

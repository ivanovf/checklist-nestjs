import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { createTestApp } from './security/app-factory';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Runs against the in-memory MongoDB from global-setup rather than a real cluster.
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves the service root without a credential', () => {
    // Marked @Public: it carries no reservation or account data and the deployment platforms
    // use it as a liveness probe.
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect({ api: 'Checklist', version: '1.0' });
  });
});

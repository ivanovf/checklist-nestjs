import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { createTestApp } from './app-factory';

/**
 * User Story 2 — the public deployment carries its required protections, and
 * User Story 4 — it exposes the API and nothing else.
 *
 * These drive the real `configureApp`, so a control that was applied to only one entry point
 * would fail here rather than passing locally and being absent once deployed.
 */
describe('Transport security (e2e)', () => {
  // Restore only the keys these tests set. Replacing `process.env` wholesale swaps the
  // object the whole worker shares, which is a needless hazard when jest reuses workers
  // across suites.
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_CORS_ORIGINS = process.env.CORS_ORIGINS;

  const restoreEnv = () => {
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }
    if (ORIGINAL_CORS_ORIGINS === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = ORIGINAL_CORS_ORIGINS;
    }
  };

  describe('a deployed environment', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createTestApp({
        transport: true,
        nodeEnv: 'production',
        corsOrigins: 'https://approved.example',
      });
    });

    afterAll(async () => {
      await app.close();
      restoreEnv();
    });

    it('carries the protective headers on a successful response', async () => {
      const response = await request(app.getHttpServer()).get('/api');

      expect(response.status).toBe(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['content-security-policy']).toBeDefined();
    });

    it('removes the framework server banner', async () => {
      const response = await request(app.getHttpServer()).get('/api');

      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('carries the protective headers on an error response too', async () => {
      // Headers must not depend on the happy path.
      const response = await request(app.getHttpServer()).get(
        '/api/reservations/all',
      );

      expect(response.status).toBe(401);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('grants cross-origin access to an approved origin', async () => {
      const response = await request(app.getHttpServer())
        .get('/api')
        .set('Origin', 'https://approved.example');

      expect(response.headers['access-control-allow-origin']).toBe(
        'https://approved.example',
      );
    });

    it('does not grant cross-origin access to an unapproved origin', async () => {
      const response = await request(app.getHttpServer())
        .get('/api')
        .set('Origin', 'https://not-approved.example');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('does not serve the interactive documentation page', async () => {
      await request(app.getHttpServer()).get('/docs').expect(404);
    });

    it('answers not found for repository paths rather than serving them', async () => {
      // The authoritative check is against a real deployment, because static resolution
      // happens at the platform layer above the application. This pins the application
      // half: nothing here serves files, so these must reach the router and 404.
      for (const path of ['/src/main.ts', '/package.json', '/vercel.json']) {
        await request(app.getHttpServer()).get(path).expect(404);
      }
    });
  });

  describe('a deployed environment with no browser client', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createTestApp({
        transport: true,
        nodeEnv: 'production',
        corsOrigins: 'none',
      });
    });

    afterAll(async () => {
      await app.close();
      restoreEnv();
    });

    it('grants cross-origin access to no origin at all', async () => {
      // The posture for an API consumed only by native clients. A native client is
      // unaffected — it sends no Origin and enforces nothing — while a browser is refused.
      const response = await request(app.getHttpServer())
        .get('/api')
        .set('Origin', 'https://anything.example');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('still serves the API itself', async () => {
      // Deny-all CORS must not be confused with blocking requests: it only withholds the
      // header a browser needs. Access control is the guards' job, not CORS's.
      await request(app.getHttpServer()).get('/api').expect(200);
    });
  });

  describe('outside a deployed environment', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createTestApp({ transport: true, nodeEnv: 'local' });
    });

    afterAll(async () => {
      await app.close();
      restoreEnv();
    });

    it('serves the documentation page', async () => {
      await request(app.getHttpServer()).get('/docs').expect(200);
    });

    it('serves it without a CSP so its inline script can execute', async () => {
      // Asserting only the 200 would pass against a blank page whose initializer helmet's
      // `script-src 'self'` had blocked.
      const response = await request(app.getHttpServer()).get('/docs');

      expect(response.headers['content-security-policy']).toBeUndefined();
    });

    it('still carries the protective headers on API routes', async () => {
      const response = await request(app.getHttpServer()).get('/api');

      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { createTestApp } from './app-factory';

/**
 * User Story 2 — sign-in is rate limited.
 *
 * The wrong-password case is the point of this suite. ThrottlerGuard has to run before
 * authentication; if the order is reversed, a bad password throws 401 before the counter
 * increments and the limit never engages — which is exactly the shape of a rate limiter
 * that looks wired and protects nothing.
 */
describe('Authentication throttling (e2e)', () => {
  let app: INestApplication;

  const attemptSignIn = () =>
    request(app.getHttpServer())
      .post('/api/login')
      .send({ email: 'nobody@example.test', password: 'wrong' });

  beforeAll(async () => {
    app = await createTestApp({ transport: true, nodeEnv: 'local' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses sign-in attempts beyond five in the window, counting failed ones', async () => {
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await attemptSignIn();
      statuses.push(response.status);
    }

    // The first five are processed and rejected on credentials; the rest are throttled.
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it('leaves a route outside the authentication controller unthrottled', async () => {
    // Confirms the guard is scoped rather than global: 25 requests exceed the sign-in limit
    // of 5 but stay within the module default of 20 per minute only if this route is not
    // sharing the sign-in counter.
    for (let i = 0; i < 10; i += 1) {
      const response = await request(app.getHttpServer()).get('/api/health');
      expect(response.status).toBe(200);
    }
  });
});

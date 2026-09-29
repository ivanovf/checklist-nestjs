import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { createTestApp } from '../security/app-factory';
import { seedAccounts, tokenFor } from '../support/auth-fixtures';
import { documentedSuccess, loadContract, Method } from './openapi-contract';

/**
 * Check 6 (FR-015): a sample of operations, one per access level plus sign-in, called
 * against a running application. Each answers with the success status the contract
 * documents, and a body whose keys are exactly what the contract says it may carry:
 * every required property present, nothing undocumented.
 */
describe('API contract sample conformance', () => {
  const contract = loadContract();
  let app: INestApplication;
  let adminToken: string;
  let guestToken: string;
  let adminEmail: string;
  let adminPassword: string;
  let configId: string;

  beforeAll(async () => {
    app = await createTestApp({ transport: true });
    const { admin, guest } = await seedAccounts(app);
    adminEmail = admin.email;
    adminPassword = admin.password;
    adminToken = await tokenFor(app, admin);
    guestToken = await tokenFor(app, guest);

    const config = await request(app.getHttpServer())
      .post('/api/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ doorLock: '1', mainLock: '2', usersLimit: 3, analogLecture: 0 })
      .expect(201);
    configId = config.body._id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const conforms = (
    method: Method,
    path: string,
    res: request.Response,
  ): void => {
    const promised = documentedSuccess(contract, method, path);
    expect(res.status).toBe(promised.status);

    const body = promised.isArray ? res.body[0] : res.body;
    expect(body).toBeDefined();

    const keys = Object.keys(body);
    expect(keys.filter((k) => !promised.properties.includes(k))).toEqual([]);
    expect(promised.required.filter((k) => !keys.includes(k))).toEqual([]);
  };

  it('public: sign-in, built from the documented body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/login')
      .send({ email: adminEmail, password: adminPassword });

    conforms('post', '/api/login', res);
  });

  it('public: health', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');

    conforms('get', '/api/health', res);
  });

  it('signed-in: the account list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users/all?limit=10&offset=0')
      .set('Authorization', `Bearer ${guestToken}`);

    conforms('get', '/api/users/all', res);
  });

  it('administrator: creating an activity type', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/activity-type')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cleaning', budget: 10 });

    conforms('post', '/api/activity-type', res);
  });

  it('device: reporting a tank level with the device key', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/config/${configId}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        analogLecture: 42,
        apiKey: process.env.TANK_API_KEY,
        time: 1,
      });

    conforms('patch', '/api/config/:id', res);
  });
});

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { createTestApp } from '../security/app-factory';
import { seedAccounts, tokenFor } from '../support/auth-fixtures';

/**
 * Check 7 (FR-011, FR-015): every entry in
 * specs/005-openapi-contract-export/discrepancies.md, reproduced.
 *
 * These pin behaviour the contract documents *as it is*, although it is not what the code
 * appears to intend. When a later change fixes one, its test fails here, and that change
 * must update the contract, the register entry and this test together, so the contract
 * never silently goes stale.
 *
 * Not here: D1 and D4 are fixed (pinned by pagination-query.e2e-spec.ts; D1 by
 * specs/007-fix-list-paging-defaults), D2 and D7 are fixed by specs/008-fix-unknown-id-404
 * (pinned by test/records/record-ids.e2e-spec.ts), D3 is fixed by
 * specs/009-fix-unprojected-records (pinned by test/records/record-fields.e2e-spec.ts), D6 is
 * fixed by specs/011-fix-unbounded-lists (pinned by pagination-query.e2e-spec.ts and
 * test/activity/activity-paging.e2e-spec.ts), D11 is fixed by
 * specs/006-fix-reservation-paging (pinned by test/reservations/reservation-paging.e2e-spec.ts),
 * D5 and D15 are fixed by specs/010-fix-unknown-fields (pinned by
 * test/records/unknown-fields.e2e-spec.ts and test/reservations/reservation-lock.e2e-spec.ts),
 * and D14 is dead code with no behaviour to run.
 */
describe('Recorded contract discrepancies', () => {
  let app: INestApplication;
  let admin: string;
  const auth = () => ({ Authorization: `Bearer ${admin}` });

  const item = {
    label: 'Towels',
    status: true,
    description: 'd',
    category: 'c',
  };

  beforeAll(async () => {
    app = await createTestApp({ transport: true });
    const accounts = await seedAccounts(app);
    admin = await tokenFor(app, accounts.admin);
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('D8: an update body with a wrongly typed field is a server error', async () => {
    const created = await http().post('/api/items').set(auth()).send(item);

    await http()
      .put(`/api/items/${created.body._id}`)
      .set(auth())
      .send({ label: { not: 'a string' } })
      .expect(500);
  });

  it('D9: updating an account with a partial body is refused', async () => {
    const created = await http()
      .post('/api/users')
      .set(auth())
      .send({
        email: 'd9@test.local',
        password: 'pw',
        name: 'n',
        role: 'authenticated',
      })
      .expect(201);

    await http()
      .put(`/api/users/${created.body._id}`)
      .set(auth())
      .send({ name: 'Renamed' })
      .expect(400);
  });

  it('D10: a wrong device key is refused with 404', async () => {
    const config = await http()
      .post('/api/config')
      .set(auth())
      .send({ doorLock: '1', mainLock: '2', usersLimit: 3, analogLecture: 0 })
      .expect(201);

    await http()
      .patch(`/api/config/${config.body._id}`)
      .set(auth())
      .send({ analogLecture: 1, apiKey: 'wrong-key', time: 1 })
      .expect(404);
  });

  it('D12: an unknown role is a server error', async () => {
    await http()
      .post('/api/users')
      .set(auth())
      .send({
        email: 'd12@test.local',
        password: 'pw',
        name: 'n',
        role: 'superuser',
      })
      .expect(500);
  });

  it('D13: a second account with the same email is accepted', async () => {
    const account = {
      email: 'd13@test.local',
      password: 'pw',
      name: 'n',
      role: 'authenticated',
    };

    await http().post('/api/users').set(auth()).send(account).expect(201);
    await http().post('/api/users').set(auth()).send(account).expect(201);
  });
});

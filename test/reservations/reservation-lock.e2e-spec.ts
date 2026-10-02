import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as request from 'supertest';

import { Reservation } from '../../src/reservations/entities/reservation.entity';
import { createTestApp } from '../security/app-factory';
import { seedAccounts, tokenFor } from '../support/auth-fixtures';

/**
 * A reservation's lock (specs/010-fix-unknown-fields, US3).
 *
 * Regression suite for issue #20 (D15). The request declared `lockUser`, which was never
 * stored. The mobile app records the lock through `userLock` instead: the lock code's user
 * slot (e.g. `"03"`), or a lock code's id in older reservations. It looks up the door code
 * itself. `userLock` is now declared, an empty value removes the lock, and `lockUser` is gone.
 */
let stay = 0;
const reservation = (extra: object = {}) => {
  stay += 1;
  const day = String(stay).padStart(2, '0');
  return {
    dateIni: `2032-01-${day}T00:00:00.000Z`,
    dateEnd: `2032-02-${day}T00:00:00.000Z`,
    type: 'direct',
    validated: false,
    contact: 'c',
    quantity: 1,
    items: [],
    ...extra,
  };
};

describe('Reservation lock (010)', () => {
  let app: INestApplication;
  let token: string;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const reservations = () =>
    app.get<Model<Reservation>>(getModelToken(Reservation.name));
  const message = (res: request.Response) =>
    ([] as string[]).concat(res.body.message).join(' | ');

  const create = async (extra: object = {}) => {
    const res = await http()
      .post('/api/reservations')
      .set(auth())
      .send(reservation(extra))
      .expect(201);
    return res;
  };
  const read = async (id: string) =>
    (await http().get(`/api/reservations/${id}`).set(auth()).expect(200)).body;
  const change = (id: string, body: object) =>
    http().put(`/api/reservations/${id}`).set(auth()).send(body);

  beforeAll(async () => {
    app = await createTestApp({ transport: true });
    const { admin } = await seedAccounts(app);
    token = await tokenFor(app, admin);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('stores the lock it is given and answers it', async () => {
    const created = await create({ userLock: '03' });

    expect(created.body.userLock).toBe('03');
    expect((await read(created.body._id)).userLock).toBe('03');
  });

  it('changes the lock, and keeps it when a change leaves it out', async () => {
    const { body } = await create({ userLock: '03' });

    await change(body._id, { userLock: '05' }).expect(200);
    expect((await read(body._id)).userLock).toBe('05');

    await change(body._id, { contact: 'z' }).expect(200);
    expect((await read(body._id)).userLock).toBe('05');
  });

  it.each([
    ['an empty value', { userLock: '' }],
    ['null', { userLock: null }],
    ['an empty value with other fields', { userLock: '', contact: 'z' }],
  ])('removes the lock when given %s', async (_, update) => {
    const { body } = await create({ userLock: '03' });

    await change(body._id, update).expect(200);

    expect(await read(body._id)).not.toHaveProperty('userLock');
  });

  it('refuses a value that is neither a user slot nor a lock id', async () => {
    const before = await reservations().countDocuments();

    const res = await http()
      .post('/api/reservations')
      .set(auth())
      .send(reservation({ userLock: 'ul' }))
      .expect(400);

    expect(message(res)).toContain('userLock');
    expect(await reservations().countDocuments()).toBe(before);
  });

  it('keeps an older lock stored as a lock id, and accepts it back on an edit', async () => {
    const lockId = '64b000000000000000000009';
    const legacy = await reservations().create(
      reservation({ userLock: lockId }),
    );
    const id = String(legacy._id);

    expect((await read(id)).userLock).toBe(lockId);

    await change(id, { _id: id, contact: 'c', userLock: lockId }).expect(200);
    expect((await read(id)).userLock).toBe(lockId);
  });

  it('refuses the removed lockUser field', async () => {
    const res = await http()
      .post('/api/reservations')
      .set(auth())
      .send(reservation({ lockUser: '3' }))
      .expect(400);

    expect(message(res)).toContain('property lockUser should not exist');
  });

  it('includes the lock in the list', async () => {
    const { body } = await create({ userLock: '07' });

    const list = await http()
      .get('/api/reservations/all?limit=50')
      .set(auth())
      .expect(200);

    const listed = (list.body as { _id: string; userLock?: string }[]).find(
      (r) => r._id === body._id,
    );
    expect(listed?.userLock).toBe('07');
  });
});

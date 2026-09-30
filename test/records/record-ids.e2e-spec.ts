import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as request from 'supertest';

import { Activity } from '../../src/activity/entities/activity.entity';
import { ActivityType } from '../../src/activity-type/entities/activity-type.entity';
import { Config } from '../../src/config/entities/config.entity';
import { Item } from '../../src/items/entities/item.entity';
import { Lock } from '../../src/locks/entities/lock.entity';
import { Reservation } from '../../src/reservations/entities/reservation.entity';
import { User } from '../../src/users/entities/user.entity';
import { createTestApp } from '../security/app-factory';
import { seedAccounts, tokenFor } from '../support/auth-fixtures';

/**
 * Every operation that reads, changes or deletes one record by its id
 * (specs/008-fix-unknown-id-404).
 *
 * Regression suite for issue #8 (D2), where an unknown id was answered as success (an empty
 * 200, or `{ deleted: true }` for a record that never existed), and issue #12 (D7), where a
 * malformed id was a server error, or a false deletion on three DELETE routes.
 *
 * Records are seeded through the models, so these tests don't depend on the create routes.
 */
const UNKNOWN = '6aba80d38c58c96b58020000';
const MALFORMED = 'abc';

type Method = 'get' | 'put' | 'patch' | 'delete';
type Access = 'auth' | 'admin' | 'device';
interface Op {
  method: Method;
  kind: string;
  access: Access;
  body?: object;
}

const BODIES: Record<string, object> = {
  users: {
    email: 'changed@test.local',
    password: 'pw',
    name: 'n',
    role: 'authenticated',
    changePassword: false,
    currentPassword: 'x',
  },
  items: { label: 'l', status: true, description: 'd', category: 'c' },
  reservations: {
    dateIni: '2026-01-01',
    dateEnd: '2026-01-02',
    type: 'direct',
    validated: false,
    contact: 'c',
    quantity: 1,
  },
  locks: { lock: '1', userNumber: '2' },
  config: { doorLock: '1', mainLock: '2', usersLimit: 3, analogLecture: 0 },
  activity: {
    type: UNKNOWN,
    status: 'TODO',
    price: 1,
    date: '2026-01-01',
    description: 'd',
  },
  'activity-type': { name: 'n', budget: 1 },
};
const deviceBody = () => ({
  analogLecture: 1,
  apiKey: process.env.TANK_API_KEY,
  time: 1,
});

const OPS: Op[] = [
  { method: 'get', kind: 'users', access: 'auth' },
  { method: 'put', kind: 'users', access: 'auth' },
  { method: 'delete', kind: 'users', access: 'admin' },
  { method: 'get', kind: 'items', access: 'auth' },
  { method: 'put', kind: 'items', access: 'admin' },
  { method: 'delete', kind: 'items', access: 'admin' },
  { method: 'get', kind: 'reservations', access: 'auth' },
  { method: 'put', kind: 'reservations', access: 'auth' },
  { method: 'delete', kind: 'reservations', access: 'admin' },
  { method: 'get', kind: 'locks', access: 'auth' },
  { method: 'put', kind: 'locks', access: 'admin' },
  { method: 'delete', kind: 'locks', access: 'admin' },
  { method: 'put', kind: 'config', access: 'admin' },
  { method: 'patch', kind: 'config', access: 'device' },
  { method: 'get', kind: 'activity', access: 'auth' },
  { method: 'put', kind: 'activity', access: 'auth' },
  { method: 'delete', kind: 'activity', access: 'admin' },
  { method: 'get', kind: 'activity-type', access: 'admin' },
  { method: 'put', kind: 'activity-type', access: 'admin' },
  { method: 'delete', kind: 'activity-type', access: 'admin' },
].map((op) => ({
  ...op,
  method: op.method as Method,
  access: op.access as Access,
  body:
    op.method === 'patch'
      ? undefined // built per call: the device key is read at run time
      : op.method === 'put'
        ? BODIES[op.kind]
        : undefined,
}));

const label = (op: Op) => `${op.method.toUpperCase()} /api/${op.kind}/:id`;

describe('By-id operations (008)', () => {
  let app: INestApplication;
  let adminToken: string;
  let guestToken: string;
  let adminId: string;

  beforeAll(async () => {
    app = await createTestApp({ transport: true });
    const { admin, guest } = await seedAccounts(app);
    adminId = admin.id;
    adminToken = await tokenFor(app, admin);
    guestToken = await tokenFor(app, guest);
  });

  afterAll(async () => {
    await app?.close();
  });

  const model = <T>(name: string) => app.get<Model<T>>(getModelToken(name));

  const call = (op: Op, id: string, token: string | null = adminToken) => {
    const path = `/api/${op.kind}/${id}`;
    let req = request(app.getHttpServer())[op.method](path);
    if (token) {
      req = req.set('Authorization', `Bearer ${token}`);
    }
    if (op.method === 'patch') {
      return req.send(deviceBody());
    }

    return op.body ? req.send(op.body) : req;
  };

  const message = (res: request.Response) =>
    ([] as string[]).concat(res.body.message).join(' ');

  it('answers a known account', async () => {
    await request(app.getHttpServer())
      .get(`/api/users/${adminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  describe('US1: unknown id', () => {
    it.each(OPS.map((op) => [label(op), op] as const))(
      '%s answers 404',
      async (_, op) => {
        const res = await call(op, UNKNOWN).expect(404);

        expect(message(res)).toMatch(/not found/i);
      },
    );

    it('an account password change on an unknown id answers 404', async () => {
      await request(app.getHttpServer())
        .put(`/api/users/${UNKNOWN}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...BODIES.users,
          changePassword: true,
          password: 'new',
          currentPassword: 'x',
        })
        .expect(404);
    });

    // Activity types refuse a wrongly typed field with 400. Items and reservations answer
    // 500 for the same kind of body, which is D8 (#13) and out of scope here.
    it('checks the body before existence', async () => {
      await request(app.getHttpServer())
        .put(`/api/activity-type/${UNKNOWN}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ budget: 'not-a-number' })
        .expect(400);
    });

    it('a change to an unknown id creates nothing', async () => {
      const items = model<Item>(Item.name);
      const before = await items.countDocuments();

      await request(app.getHttpServer())
        .put(`/api/items/${UNKNOWN}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(BODIES.items)
        .expect(404);

      expect(await items.countDocuments()).toBe(before);
    });

    /** Seeds one record of the kind and returns its id. */
    const seed = async (kind: string): Promise<string> => {
      const create = async <T>(name: string, doc: object) =>
        String((await model<T>(name).create(doc))._id);

      switch (kind) {
        case 'users':
          return create<User>(User.name, {
            email: 'roundtrip@test.local',
            name: 'r',
            role: 'authenticated',
            password: '$2b$10$synthetic.placeholder.hash.value.for.id.tests',
          });
        case 'items':
          return create<Item>(Item.name, BODIES.items);
        case 'locks':
          return create<Lock>(Lock.name, BODIES.locks);
        case 'reservations':
          return create<Reservation>(Reservation.name, BODIES.reservations);
        case 'activity-type':
          return create<ActivityType>(
            ActivityType.name,
            BODIES['activity-type'],
          );
        case 'activity': {
          const type = await create<ActivityType>(ActivityType.name, {
            name: 'for activity',
            budget: 1,
          });
          return create<Activity>(Activity.name, { ...BODIES.activity, type });
        }
        default:
          throw new Error(`no seed for ${kind}`);
      }
    };

    it.each([
      ['items', { deleted: true }],
      ['locks', { deleted: true }],
      ['reservations', { deleted: true }],
      ['users', { deleted: true }],
      ['activity-type', null],
      ['activity', { message: 'Activity deleted successfully' }],
    ] as const)(
      '%s: read, change and delete work, then the record is gone',
      async (kind, deletedBody) => {
        const id = await seed(kind);
        const http = () => request(app.getHttpServer());
        const auth = { Authorization: `Bearer ${adminToken}` };
        const body =
          kind === 'activity'
            ? { ...BODIES.activity, type: await seed('activity-type') }
            : BODIES[kind];

        await http().get(`/api/${kind}/${id}`).set(auth).expect(200);

        const changed = await http()
          .put(`/api/${kind}/${id}`)
          .set(auth)
          .send(body)
          .expect(200);
        expect(String(changed.body._id)).toBe(id);

        const deleted = await http()
          .delete(`/api/${kind}/${id}`)
          .set(auth)
          .expect(200);
        if (deletedBody) {
          expect(deleted.body).toEqual(deletedBody);
        } else {
          expect(String(deleted.body._id)).toBe(id);
        }

        await http().get(`/api/${kind}/${id}`).set(auth).expect(404);
        await http().delete(`/api/${kind}/${id}`).set(auth).expect(404);
      },
    );

    it('config: an existing record can still be changed and reported on', async () => {
      const id = String(
        (await model<Config>(Config.name).create(BODIES.config))._id,
      );

      const changed = await request(app.getHttpServer())
        .put(`/api/config/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(BODIES.config)
        .expect(200);
      expect(String(changed.body._id)).toBe(id);

      await request(app.getHttpServer())
        .patch(`/api/config/${id}`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send(deviceBody())
        .expect(200);
    });
  });

  describe('US2: malformed id', () => {
    it.each(OPS.map((op) => [label(op), op] as const))(
      '%s answers 400',
      async (_, op) => {
        const res = await call(op, MALFORMED).expect(400);

        expect(message(res)).toContain('Invalid id');
        expect(res.body).not.toEqual({ deleted: true });
      },
    );

    it.each(OPS.map((op) => [label(op), op] as const))(
      '%s still answers 401 first without a token',
      async (_, op) => {
        await call(op, MALFORMED, null).expect(401);
      },
    );

    it.each(
      OPS.filter((op) => op.access === 'admin').map(
        (op) => [label(op), op] as const,
      ),
    )('%s still answers 403 first for a non-administrator', async (_, op) => {
      await call(op, MALFORMED, guestToken).expect(403);
    });

    it('a malformed id with an invalid body answers 400', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/activity-type/${MALFORMED}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ budget: 'not-a-number' })
        .expect(400);

      // Research R3 predicts the id's refusal wins; recorded either way.
      expect(message(res)).toMatch(/Invalid id|budget/);
    });
  });
});

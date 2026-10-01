import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as request from 'supertest';

import { Activity } from '../../src/activity/entities/activity.entity';
import { ActivityType } from '../../src/activity-type/entities/activity-type.entity';
import { Config } from '../../src/config/entities/config.entity';
import { Item } from '../../src/items/entities/item.entity';
import { Lock } from '../../src/locks/entities/lock.entity';
import { Reservation } from '../../src/reservations/entities/reservation.entity';
import { User } from '../../src/users/entities/user.entity';
import { createTestApp } from '../security/app-factory';
import {
  seedAccounts,
  tokenFor,
  SeededAccount,
} from '../support/auth-fixtures';

/**
 * Undeclared request fields and parameters (specs/010-fix-unknown-fields).
 *
 * Regression suite for issue #10 (D5). Every create and change accepted fields it doesn't
 * declare, and stored the ones the record happens to have: a caller could choose a record's
 * `_id` or backdate its `createdAt` (research R1). Lists ignored unknown query parameters.
 *
 * Also pinned here: what must not change. Bodies with only declared fields, the mobile app's
 * real payloads (which repeat the record's own `_id` on every edit, research R4), and the
 * checklist regression a naive fix would cause (research R2).
 */
const ITEM = { label: 'l', status: true, description: 'd', category: 'c' };
const CONFIG = {
  doorLock: '1',
  mainLock: '2',
  usersLimit: 3,
  analogLecture: 0,
};

let stay = 0;
/** A reservation on its own dates: identical date pairs are refused as unavailable. */
const reservation = () => {
  stay += 1;
  const day = String(stay).padStart(2, '0');
  return {
    dateIni: `2031-01-${day}T00:00:00.000Z`,
    dateEnd: `2031-02-${day}T00:00:00.000Z`,
    type: 'direct',
    validated: false,
    contact: 'c',
    quantity: 1,
    items: [],
  };
};

let account = 0;
const user = () => {
  account += 1;
  return {
    email: `unknown-fields-${account}@test.local`,
    password: 'pw',
    name: 'n',
    role: 'authenticated',
  };
};

interface BodyOp {
  kind: string;
  model: string;
  create: () => object;
  change: () => object;
}

describe('Undeclared request fields (010)', () => {
  let app: INestApplication;
  let admin: SeededAccount;
  let adminToken: string;
  let guestToken: string;
  let typeId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
  const model = (name: string) => app.get<Model<unknown>>(getModelToken(name));
  const message = (res: request.Response) =>
    ([] as string[]).concat(res.body.message).join(' | ');
  const stored = async (name: string, id: string) =>
    JSON.parse(JSON.stringify(await model(name).findById(id).lean()));

  const BODY_OPS: BodyOp[] = [
    {
      kind: 'items',
      model: Item.name,
      create: () => ITEM,
      change: () => ({ label: 'changed' }),
    },
    {
      kind: 'locks',
      model: Lock.name,
      create: () => ({ lock: '1', userNumber: '2' }),
      change: () => ({ lock: '3' }),
    },
    {
      kind: 'users',
      model: User.name,
      create: user,
      change: () => ({
        ...user(),
        changePassword: false,
        currentPassword: 'x',
      }),
    },
    {
      kind: 'reservations',
      model: Reservation.name,
      create: reservation,
      change: () => ({ contact: 'z' }),
    },
    {
      kind: 'config',
      model: Config.name,
      create: () => CONFIG,
      change: () => ({ doorLock: '2' }),
    },
    {
      kind: 'activity',
      model: Activity.name,
      create: () => ({
        type: typeId,
        status: 'TODO',
        price: 1,
        date: '2026-01-01',
        description: 'd',
      }),
      change: () => ({ price: 2 }),
    },
    {
      kind: 'activity-type',
      model: ActivityType.name,
      create: () => ({ name: 'n', budget: 1 }),
      change: () => ({ budget: 2 }),
    },
  ];

  /** Creates one record through the API and returns its id. */
  const seed = async (op: BodyOp): Promise<string> => {
    const res = await http()
      .post(`/api/${op.kind}`)
      .set(auth())
      .send(op.create())
      .expect(201);
    return String(res.body._id);
  };

  beforeAll(async () => {
    app = await createTestApp({ transport: true });
    const accounts = await seedAccounts(app);
    admin = accounts.admin;
    adminToken = await tokenFor(app, accounts.admin);
    guestToken = await tokenFor(app, accounts.guest);

    const type = await http()
      .post('/api/activity-type')
      .set(auth())
      .send({ name: 'seed', budget: 1 })
      .expect(201);
    typeId = String(type.body._id);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe.each(BODY_OPS.map((op) => [op.kind, op] as const))('%s', (_, op) => {
    describe('create', () => {
      it('refuses an undeclared field and creates nothing', async () => {
        const before = await model(op.model).countDocuments();

        const res = await http()
          .post(`/api/${op.kind}`)
          .set(auth())
          .send({ ...op.create(), notAField: true })
          .expect(400);

        expect(message(res)).toContain('property notAField should not exist');
        expect(await model(op.model).countDocuments()).toBe(before);
      });

      it.each([
        ['createdAt', '2000-01-01'],
        ['updatedAt', '2000-01-01'],
        ['__v', 0],
      ])('refuses %s', async (field, value) => {
        const res = await http()
          .post(`/api/${op.kind}`)
          .set(auth())
          .send({ ...op.create(), [field]: value })
          .expect(400);

        expect(message(res)).toContain(`property ${field} should not exist`);
      });

      it('refuses a caller-chosen _id, and no record takes it', async () => {
        const chosen = String(new Types.ObjectId());

        const res = await http()
          .post(`/api/${op.kind}`)
          .set(auth())
          .send({ ...op.create(), _id: chosen })
          .expect(400);

        expect(message(res)).toContain('property _id should not exist');
        expect(await model(op.model).exists({ _id: chosen })).toBeNull();
      });

      it('accepts a body with only declared fields', async () => {
        await http()
          .post(`/api/${op.kind}`)
          .set(auth())
          .send(op.create())
          .expect(201);
      });
    });

    describe('change', () => {
      let id: string;

      beforeAll(async () => {
        id = await seed(op);
      });

      it('refuses an undeclared field and changes nothing', async () => {
        const before = await stored(op.model, id);

        const res = await http()
          .put(`/api/${op.kind}/${id}`)
          .set(auth())
          .send({ ...op.change(), notAField: true })
          .expect(400);

        expect(message(res)).toContain('property notAField should not exist');
        expect(await stored(op.model, id)).toStrictEqual(before);
      });

      it.each([
        ['createdAt', '2000-01-01'],
        ['updatedAt', '2000-01-01'],
        ['__v', 0],
      ])('refuses %s', async (field, value) => {
        await http()
          .put(`/api/${op.kind}/${id}`)
          .set(auth())
          .send({ ...op.change(), [field]: value })
          .expect(400);
      });

      it("accepts the record's own _id, as the mobile app sends it", async () => {
        await http()
          .put(`/api/${op.kind}/${id}`)
          .set(auth())
          .send({ ...op.change(), _id: id })
          .expect(200);
      });

      it('refuses a different _id and changes nothing', async () => {
        const before = await stored(op.model, id);

        const res = await http()
          .put(`/api/${op.kind}/${id}`)
          .set(auth())
          .send({ ...op.change(), _id: String(new Types.ObjectId()) })
          .expect(400);

        expect(message(res)).toContain('_id must match the id in the path');
        expect(await stored(op.model, id)).toStrictEqual(before);
      });

      it('accepts a body with only declared fields', async () => {
        await http()
          .put(`/api/${op.kind}/${id}`)
          .set(auth())
          .send(op.change())
          .expect(200);
      });
    });
  });

  /**
   * The bodies `flutter/reservations` sends when editing (its `toJson()` models, read
   * 2026-10-01). They must keep working: the owner chose not to change the app.
   */
  describe('mobile app payloads', () => {
    it('edits a lock code', async () => {
      const id = await seed(BODY_OPS[1]);

      await http()
        .put(`/api/locks/${id}`)
        .set(auth())
        .send({ _id: id, userNumber: '04', lock: '7732' })
        .expect(200);
    });

    it('edits an activity', async () => {
      const id = await seed(BODY_OPS[5]);

      await http()
        .put(`/api/activity/${id}`)
        .set(auth())
        .send({
          _id: id,
          type: typeId,
          date: '2026-03-01T00:00:00.000',
          price: 5,
          description: 'd',
          status: 'TODO',
        })
        .expect(200);
    });

    it('edits an activity type', async () => {
      const id = await seed(BODY_OPS[6]);

      await http()
        .put(`/api/activity-type/${id}`)
        .set(auth())
        .send({ _id: id, name: 'n', description: 'd', budget: 3 })
        .expect(200);
    });

    // The joint gate of US1 and US3: it needs both the checklist item's `_id` and `userLock`
    // to be declared (tasks T012, T024).
    it('edits a reservation with its checklist and lock, keeping item ids', async () => {
      const created = await http()
        .post('/api/reservations')
        .set(auth())
        .send({ ...reservation(), items: [ITEM] })
        .expect(201);
      const id = String(created.body._id);
      const itemId = String(created.body.items[0]._id);
      const dates = reservation();

      await http()
        .put(`/api/reservations/${id}`)
        .set(auth())
        .send({
          _id: id,
          dateIni: dates.dateIni,
          dateEnd: dates.dateEnd,
          contact: 'c',
          quantity: 2,
          cost: 100,
          type: 'direct',
          validated: true,
          userLock: '03',
          items: [
            {
              _id: itemId,
              label: 'l',
              description: 'd',
              checked: true,
              comments: 'ok',
              category: 'c',
              status: true,
            },
          ],
        })
        .expect(200);

      const after = await stored(Reservation.name, id);
      expect(after.items[0]._id).toBe(itemId);
      expect(after.items[0].checked).toBe(true);
      expect(after.userLock).toBe('03');
    });
  });

  describe('reservation items', () => {
    it('refuses an undeclared field inside an item, on create and change', async () => {
      const res = await http()
        .post('/api/reservations')
        .set(auth())
        .send({ ...reservation(), items: [{ ...ITEM, y: 1 }] })
        .expect(400);
      expect(message(res)).toContain('items.0.property y should not exist');

      const id = await seed(BODY_OPS[3]);
      const change = await http()
        .put(`/api/reservations/${id}`)
        .set(auth())
        .send({ items: [{ ...ITEM, y: 1 }] })
        .expect(400);
      expect(message(change)).toContain('items.0.property y should not exist');
    });
  });

  /**
   * A partial change must reach the service exactly as sent. Rebuilding it from the DTO would
   * add `checked: false, comments: ''` and undo the checklist (research R2).
   */
  describe('values pass through unchanged', () => {
    it('a partial item change keeps checked and comments', async () => {
      const id = await seed(BODY_OPS[0]);
      const put = (body: object) =>
        http().put(`/api/items/${id}`).set(auth()).send(body).expect(200);

      await put({ checked: true, comments: 'ok' });
      await put({ label: 'x' });

      const after = await stored(Item.name, id);
      expect(after).toMatchObject({
        label: 'x',
        checked: true,
        comments: 'ok',
      });
    });

    it("a reservation change keeps its items' checked state", async () => {
      const created = await http()
        .post('/api/reservations')
        .set(auth())
        .send({ ...reservation(), items: [{ ...ITEM, checked: true }] })
        .expect(201);
      const id = String(created.body._id);

      await http()
        .put(`/api/reservations/${id}`)
        .set(auth())
        .send({ contact: 'z' })
        .expect(200);

      expect((await stored(Reservation.name, id)).items[0].checked).toBe(true);
    });

    it('a status sent as the text "false" is stored as false, as before', async () => {
      const res = await http()
        .post('/api/items')
        .set(auth())
        .send({ ...ITEM, status: 'false' })
        .expect(201);

      expect((await stored(Item.name, res.body._id)).status).toBe(false);
    });
  });

  describe('order of refusals', () => {
    const UNKNOWN = '6aba80d38c58c96b58020000';

    it('an unauthenticated caller is refused first', async () => {
      await http()
        .post('/api/items')
        .send({ ...ITEM, notAField: true })
        .expect(401);
    });

    it('a caller without the role is refused before the body', async () => {
      await http()
        .post('/api/items')
        .set(auth(guestToken))
        .send({ ...ITEM, notAField: true })
        .expect(403);
    });

    it('a mismatched _id from an unauthenticated caller is still a 401', async () => {
      await http()
        .put(`/api/items/${UNKNOWN}`)
        .send({ _id: String(new Types.ObjectId()) })
        .expect(401);
    });

    it('a malformed path id is refused for the id', async () => {
      const res = await http()
        .put('/api/items/abc')
        .set(auth())
        .send({ notAField: true })
        .expect(400);

      expect(message(res)).toContain('Invalid id "abc"');
    });

    it('the body is checked before the record is looked up', async () => {
      const res = await http()
        .put(`/api/items/${UNKNOWN}`)
        .set(auth())
        .send({ notAField: true })
        .expect(400);

      expect(message(res)).toContain('property notAField should not exist');
    });
  });

  describe('list query parameters', () => {
    it.each([
      '/api/items/all?limit=5&offset=0',
      '/api/locks/all?limit=5&offset=0',
      '/api/users/all?limit=5&offset=0',
      '/api/reservations/all?limit=5',
      '/api/activity?status=TODO',
    ])('%s refuses an undeclared parameter', async (path) => {
      const res = await http().get(`${path}&foo=1`).set(auth()).expect(400);

      expect(message(res)).toContain('property foo should not exist');
    });

    it.each([
      '/api/items/all?limit=5&offset=0',
      '/api/locks/all?limit=5&offset=0',
      '/api/users/all?limit=5&offset=0',
      '/api/reservations/all?limit=5',
      '/api/activity?status=TODO',
    ])('%s accepts its declared parameters', async (path) => {
      await http().get(path).set(auth()).expect(200);
    });

    it("accepts the mobile app's reservation query", async () => {
      await http()
        .get(
          '/api/reservations/all?dateFrom=2026-01-01&dateTo=2026-12-31&sort=asc' +
            '&type=direct&validated=true&limit=10&offset=0',
        )
        .set(auth())
        .expect(200);
    });

    // These lists declare no parameters and never read the query.
    it.each(['/api/config?foo=1', '/api/activity-type?foo=1'])(
      '%s still ignores a parameter',
      async (path) => {
        await http().get(path).set(auth()).expect(200);
      },
    );
  });

  it('sign-in is out of scope and still accepts an extra field', async () => {
    await http()
      .post('/api/login')
      .send({ email: admin.email, password: admin.password, x: 1 })
      .expect(201);
  });

  describe('device tank-level report', () => {
    let id: string;
    const report = () => ({
      analogLecture: 7,
      apiKey: process.env.TANK_API_KEY,
      time: 1,
    });
    const patch = (body: object) =>
      http().patch(`/api/config/${id}`).set(auth()).send(body);

    beforeAll(async () => {
      id = await seed(BODY_OPS[4]);
    });

    it('refuses an undeclared field and keeps the reading', async () => {
      const before = await stored(Config.name, id);

      const res = await patch({ ...report(), x: 1 }).expect(400);

      expect(message(res)).toContain('property x should not exist');
      expect(await stored(Config.name, id)).toStrictEqual(before);
    });

    it('records a valid report', async () => {
      await patch(report()).expect(200);

      expect((await stored(Config.name, id)).analogLecture).toBe(7);
    });

    it('still refuses a wrong device key with 404 (D10)', async () => {
      await patch({ ...report(), apiKey: 'wrong' }).expect(404);
    });

    it('checks the body before the device key', async () => {
      await patch({ ...report(), apiKey: 'wrong', x: 1 }).expect(400);
    });

    it("accepts the configuration's own _id", async () => {
      await patch({ ...report(), _id: id }).expect(200);
    });

    it('refuses a different _id', async () => {
      await patch({ ...report(), _id: String(new Types.ObjectId()) }).expect(
        400,
      );
    });
  });
});

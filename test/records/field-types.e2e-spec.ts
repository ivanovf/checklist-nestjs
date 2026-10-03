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
 * Wrongly typed body fields (specs/014-fix-mistyped-fields).
 *
 * Regression suite for issue #13 (D8). Bodies were checked after implicit conversion but
 * stored as they were sent (research R1). So an object passed as a label and then failed in
 * storage (500), a number passed as a date and was stored as 1970, and text passed as a
 * yes/no. Separately, `null` emptied required fields on a change, because partial change
 * bodies skipped validation for it.
 *
 * Also pinned here: what must not change. The mobile app's real payloads (research R7), the
 * date forms clients send, and the optional fields a change may still clear.
 *
 * The in-memory database is shared with every other suite, which list reservations newest
 * first. Reservations here are dated 2010 so they stay off those pages, and every record this
 * suite creates is deleted afterwards.
 */
type Kind = 'text' | 'yes/no' | 'number' | 'date' | 'id' | 'enum' | 'list';

const TYPE_MESSAGE: Record<Kind, string> = {
  text: 'must be a string',
  'yes/no': 'must be a boolean value',
  number: 'must be a number conforming to the specified constraints',
  date: 'must be a date in ISO 8601 format',
  id: 'must be a mongodb id',
  enum: 'must be one of the following values',
  list: 'must be an array',
};

const ITEM = { label: 'l', status: true, description: 'd', category: 'c' };

const DAY = 24 * 60 * 60 * 1000;
let stay = 0;
/** A pair of 2010 dates no other reservation in this suite uses. */
const stayDates = () => {
  stay += 1;
  const start = Date.UTC(2010, 0, 1) + stay * DAY;
  return {
    dateIni: new Date(start).toISOString(),
    dateEnd: new Date(start + DAY).toISOString(),
  };
};
const reservation = () => ({
  ...stayDates(),
  type: 'direct',
  validated: false,
  contact: 'c',
  quantity: 2,
  cost: 10,
  items: [ITEM],
});

let account = 0;
const user = () => {
  account += 1;
  return {
    email: `field-types-${account}@test.local`,
    password: 'pw',
    name: 'n',
    role: 'authenticated',
  };
};

interface RecordKind {
  kind: string;
  model: string;
  create: () => Record<string, unknown>;
  /** The body a change sends besides the field under test. Only accounts need one (D9). */
  changeBase: (seeded: Record<string, unknown>) => Record<string, unknown>;
  fields: Record<string, Kind>;
  /** Fields a change may set to `null`, because create marks them optional. */
  nullable: string[];
}

describe('Wrongly typed body fields (014)', () => {
  let app: INestApplication;
  let adminToken: string;
  let guestToken: string;
  let typeId: string;
  const created: Record<string, string[]> = {};

  const http = () => request(app.getHttpServer());
  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
  const model = (name: string) => app.get<Model<unknown>>(getModelToken(name));
  const message = (res: request.Response) =>
    ([] as string[]).concat(res.body.message).join(' | ');
  const stored = async (name: string, id: string) =>
    JSON.parse(JSON.stringify(await model(name).findById(id).lean()));
  const track = (name: string, id: string) => {
    (created[name] ??= []).push(id);
    return id;
  };

  const expectRefused = (res: request.Response, field: string, kind: Kind) => {
    expect(res.status).toBe(400);
    expect(message(res)).toContain(`${field} ${TYPE_MESSAGE[kind]}`);
  };

  const RECORDS: RecordKind[] = [
    {
      kind: 'items',
      model: Item.name,
      create: () => ({ ...ITEM }),
      changeBase: () => ({}),
      fields: {
        label: 'text',
        status: 'yes/no',
        checked: 'yes/no',
        description: 'text',
        comments: 'text',
        category: 'text',
      },
      nullable: [],
    },
    {
      kind: 'reservations',
      model: Reservation.name,
      create: reservation,
      changeBase: () => ({}),
      fields: {
        dateIni: 'date',
        dateEnd: 'date',
        type: 'text',
        validated: 'yes/no',
        contact: 'text',
        quantity: 'number',
        cost: 'number',
        items: 'list',
      },
      nullable: ['cost'],
    },
    {
      kind: 'locks',
      model: Lock.name,
      create: () => ({ lock: '1234', userNumber: '3' }),
      changeBase: () => ({}),
      fields: { lock: 'text', userNumber: 'text' },
      nullable: [],
    },
    {
      kind: 'activity-type',
      model: ActivityType.name,
      create: () => ({ name: 'n', budget: 3, description: 'd' }),
      changeBase: () => ({}),
      fields: { name: 'text', budget: 'number', description: 'text' },
      nullable: ['description'],
    },
    {
      kind: 'activity',
      model: Activity.name,
      create: () => ({
        type: typeId,
        status: 'TODO',
        price: 3,
        date: '2026-01-01T00:00:00.000',
        description: 'd',
      }),
      changeBase: () => ({}),
      fields: {
        type: 'id',
        status: 'enum',
        price: 'number',
        date: 'date',
        description: 'text',
      },
      nullable: ['description'],
    },
    {
      kind: 'config',
      model: Config.name,
      create: () => ({
        doorLock: '1',
        mainLock: '2',
        usersLimit: 3,
        analogLecture: 0,
      }),
      changeBase: () => ({}),
      fields: {
        doorLock: 'text',
        mainLock: 'text',
        usersLimit: 'number',
        analogLecture: 'number',
      },
      nullable: [],
    },
    {
      kind: 'users',
      model: User.name,
      create: user,
      // Every account change carries the whole body (D9). Its own values keep it unchanged.
      changeBase: (seeded) => ({
        ...seeded,
        changePassword: false,
        currentPassword: 'pw',
      }),
      fields: { email: 'text', password: 'text', name: 'text', role: 'text' },
      nullable: [],
    },
  ];

  /** Creates one record through the API, tracks it for clean-up, and returns it. */
  const seed = async (rec: RecordKind) => {
    const body = rec.create();
    const res = await http()
      .post(`/api/${rec.kind}`)
      .set(auth())
      .send(body)
      .expect(201);
    return { id: track(rec.model, String(res.body._id)), body };
  };

  /** One test case per record kind, field and value, from a picker per field kind. */
  const matrix = (pick: (kind: Kind, field: string) => unknown[]) =>
    RECORDS.flatMap((rec) =>
      Object.entries(rec.fields).flatMap(([field, kind]) =>
        pick(kind, field).map(
          (value) => [rec.kind, field, value, kind, rec] as const,
        ),
      ),
    );

  /** Create and change with `value` in `field`: refused naming it, and nothing stored. */
  const expectFieldRefused = (cases: ReturnType<typeof matrix>): void => {
    it.each(cases)(
      'create %s with %s = %p is refused',
      async (_, field, value, kind, rec) => {
        const before = await model(rec.model).countDocuments();

        const res = await http()
          .post(`/api/${rec.kind}`)
          .set(auth())
          .send({ ...rec.create(), [field]: value });

        expectRefused(res, field, kind);
        expect(await model(rec.model).countDocuments()).toBe(before);
      },
    );

    it.each(cases)(
      'change %s with %s = %p is refused',
      async (_, field, value, kind, rec) => {
        const { id, body } = await seed(rec);
        const before = await stored(rec.model, id);

        const res = await http()
          .put(`/api/${rec.kind}/${id}`)
          .set(auth())
          .send({ ...rec.changeBase(body), [field]: value });

        expectRefused(res, field, kind);
        expect(await stored(rec.model, id)).toStrictEqual(before);
      },
    );
  };

  beforeAll(async () => {
    app = await createTestApp({ transport: true });
    const accounts = await seedAccounts(app);
    adminToken = await tokenFor(app, accounts.admin);
    guestToken = await tokenFor(app, accounts.guest);

    const type = await http()
      .post('/api/activity-type')
      .set(auth())
      .send({ name: 'seed', budget: 1 })
      .expect(201);
    typeId = track(ActivityType.name, String(type.body._id));
  });

  afterAll(async () => {
    if (app) {
      for (const [name, ids] of Object.entries(created)) {
        await model(name).deleteMany({ _id: { $in: ids } });
      }
      await app.close();
    }
  });

  describe('no wrongly typed value is a server error (US1)', () => {
    // Each of these answered 500 on 2026-10-02 (research R1), except `checked` and
    // `comments`, which already refused them.
    expectFieldRefused(
      matrix((kind, field) => {
        if (field === 'cost') return ['abc', {}, ['x']];
        if (kind === 'text') return [{ not: 'x' }];
        if (kind === 'yes/no') return ['abc', 7, {}];
        if (kind === 'date') return [true];
        return [];
      }),
    );

    describe('inside a reservation checklist entry', () => {
      it.each([
        ['label', { not: 'x' }, 'text'],
        ['status', 'abc', 'yes/no'],
        ['status', 7, 'yes/no'],
      ] as const)(
        '%s = %p is refused on create and change',
        async (field, value, kind) => {
          const entry = { ...ITEM, [field]: value };

          expectRefused(
            await http()
              .post('/api/reservations')
              .set(auth())
              .send({ ...reservation(), items: [entry] }),
            `items.0.${field}`,
            kind,
          );

          const { id } = await seed(RECORDS[1]);
          const before = await stored(Reservation.name, id);
          expectRefused(
            await http()
              .put(`/api/reservations/${id}`)
              .set(auth())
              .send({ items: [entry] }),
            `items.0.${field}`,
            kind,
          );
          expect(await stored(Reservation.name, id)).toStrictEqual(before);
        },
      );
    });

    it('names every wrongly typed field in one refusal', async () => {
      const { id } = await seed(RECORDS[0]);

      const res = await http()
        .put(`/api/items/${id}`)
        .set(auth())
        .send({ label: { not: 'x' }, status: 'abc' });

      expectRefused(res, 'label', 'text');
      expectRefused(res, 'status', 'yes/no');
    });

    it('names a wrongly typed field together with an undeclared one', async () => {
      const { id } = await seed(RECORDS[0]);

      const res = await http()
        .put(`/api/items/${id}`)
        .set(auth())
        .send({ label: { not: 'x' }, extra: 1 });

      expectRefused(res, 'label', 'text');
      expect(message(res)).toContain('property extra should not exist');
    });

    describe('device tank-level report', () => {
      let id: string;
      const report = (patch: object) =>
        http()
          .patch(`/api/config/${id}`)
          .set(auth())
          .send({
            analogLecture: 7,
            apiKey: process.env.TANK_API_KEY,
            time: 1,
            ...patch,
          });

      beforeAll(async () => {
        ({ id } = await seed(RECORDS[5]));
      });

      it.each([
        ['analogLecture', '1', 'number'],
        ['analogLecture', true, 'number'],
        ['analogLecture', {}, 'number'],
        ['time', '1', 'number'],
        ['apiKey', 5, 'text'],
      ] as const)('%s = %p is refused', async (field, value, kind) => {
        const before = await stored(Config.name, id);

        expectRefused(await report({ [field]: value }), field, kind);
        expect(await stored(Config.name, id)).toStrictEqual(before);
      });

      it('still refuses a well-typed wrong key with 404 (D10)', async () => {
        const res = await report({ apiKey: 'wrong-key' });

        expect(res.status).toBe(404);
        expect(message(res)).toBe('Invalid API Key');
      });
    });

    it('refuses a wrongly typed new password when completing a recovery', async () => {
      // Sent once: the route is throttled per source.
      const res = await http()
        .post('/api/password-recovery/complete')
        .send({ email: 'x@test.local', code: '123456', newPassword: 12345678 });

      expectRefused(res, 'newPassword', 'text');
    });

    describe('order of refusals (unchanged)', () => {
      it('an unauthenticated caller is refused first', async () => {
        const { id } = await seed(RECORDS[0]);

        await http()
          .put(`/api/items/${id}`)
          .send({ label: { not: 'x' } })
          .expect(401);
      });

      it('a caller without the role is refused before the body', async () => {
        await http()
          .post('/api/items')
          .set(auth(guestToken))
          .send({ ...ITEM, label: { not: 'x' } })
          .expect(403);
      });

      it('a malformed path id is refused for the id', async () => {
        const res = await http()
          .put('/api/items/not-an-id')
          .set(auth())
          .send({ label: { not: 'x' } })
          .expect(400);

        expect(message(res)).toContain('Invalid id');
      });

      it('a wrongly typed date is refused before availability is checked', async () => {
        const taken = await seed(RECORDS[1]);
        const { id } = await seed(RECORDS[1]);

        const res = await http()
          .put(`/api/reservations/${id}`)
          .set(auth())
          .send({ dateIni: true, dateEnd: taken.body.dateEnd });

        expectRefused(res, 'dateIni', 'date');
        expect(message(res)).not.toContain('Reservation not available');
      });
    });
  });

  describe('what is accepted is what is stored (US2)', () => {
    // Each of these succeeded on 2026-10-02 and stored a converted value (research R1),
    // except where noted in tasks T008.
    expectFieldRefused(
      matrix((kind) => {
        if (kind === 'text') return [7, true];
        if (kind === 'number') return [true, '3'];
        // `20260101` and `2026-W01` were already refused, and must stay refused (R3).
        if (kind === 'date') return [7, '2026-02-30', '20260101', '2026-W01'];
        if (kind === 'yes/no') return ['false'];
        return [];
      }),
    );

    it('refuses text for changePassword on an account change', async () => {
      const { id, body } = await seed(RECORDS[6]);
      const before = await stored(User.name, id);

      const res = await http()
        .put(`/api/users/${id}`)
        .set(auth())
        .send({ ...RECORDS[6].changeBase(body), changePassword: 'abc' });

      expectRefused(res, 'changePassword', 'yes/no');
      expect(await stored(User.name, id)).toStrictEqual(before);
    });

    it('refuses a number for a reservation lock', async () => {
      const { id } = await seed(RECORDS[1]);
      const before = await stored(Reservation.name, id);

      const res = await http()
        .put(`/api/reservations/${id}`)
        .set(auth())
        .send({ userLock: 7 });

      expect(res.status).toBe(400);
      expect(message(res)).toContain('userLock must be a lock user slot');
      expect(await stored(Reservation.name, id)).toStrictEqual(before);
    });
  });

  describe('a change cannot empty a required field (US3)', () => {
    // Accounts are left out: their change body is whole and already refuses `null` (D9).
    const required = RECORDS.filter((rec) => rec.kind !== 'users').flatMap(
      (rec) =>
        Object.entries(rec.fields)
          .filter(([field]) => !rec.nullable.includes(field))
          .map(([field, kind]) => [rec.kind, field, kind, rec] as const),
    );

    it.each(required)(
      'change %s with %s = null is refused',
      async (_, field, kind, rec) => {
        const { id } = await seed(rec);
        const before = await stored(rec.model, id);

        const res = await http()
          .put(`/api/${rec.kind}/${id}`)
          .set(auth())
          .send({ [field]: null });

        expectRefused(res, field, kind);
        expect(await stored(rec.model, id)).toStrictEqual(before);
      },
    );

    it.each([
      ['reservations', 'cost', 1],
      ['activity', 'description', 4],
      ['activity-type', 'description', 3],
    ] as const)('change %s may still clear %s', async (kind, field, index) => {
      const rec = RECORDS[index];
      const { id } = await seed(rec);

      await http()
        .put(`/api/${kind}/${id}`)
        .set(auth())
        .send({ [field]: null })
        .expect(200);

      expect((await stored(rec.model, id))[field]).toBeNull();
    });

    it('a change may still remove a reservation lock', async () => {
      const res = await http()
        .post('/api/reservations')
        .set(auth())
        .send({ ...reservation(), userLock: '03' })
        .expect(201);
      const id = track(Reservation.name, String(res.body._id));

      const changed = await http()
        .put(`/api/reservations/${id}`)
        .set(auth())
        .send({ userLock: null })
        .expect(200);

      expect(changed.body).not.toHaveProperty('userLock');
      expect(await stored(Reservation.name, id)).not.toHaveProperty('userLock');
    });

    it('a create still refuses null for a required field', async () => {
      expectRefused(
        await http()
          .post('/api/items')
          .set(auth())
          .send({ ...ITEM, label: null }),
        'label',
        'text',
      );
    });
  });

  describe('mobile app payloads keep working (FR-003)', () => {
    // Built as the Flutter models' toJson() builds them (research R7).
    it('creates, edits and validates a reservation with its checklist and lock', async () => {
      const dates = stayDates();
      const body = {
        dateIni: dates.dateIni.replace('Z', ''),
        dateEnd: dates.dateEnd.replace('Z', ''),
        contact: 'Guest',
        quantity: 2,
        cost: 120.5,
        type: 'direct',
        validated: false,
        userLock: '03',
        items: [{ ...ITEM, checked: false, comments: '' }],
      };
      const res = await http()
        .post('/api/reservations')
        .set(auth())
        .send(body)
        .expect(201);
      const id = track(Reservation.name, String(res.body._id));
      const items = (res.body.items as { _id: string; label: string }[]).map(
        (entry) => ({
          _id: entry._id,
          label: entry.label,
          description: 'd',
          checked: true,
          comments: 'ok',
          category: 'c',
          status: true,
        }),
      );

      for (const validated of [false, true]) {
        await http()
          .put(`/api/reservations/${id}`)
          .set(auth())
          .send({ _id: id, ...body, validated, userLock: '04', items })
          .expect(200);
      }

      const record = await stored(Reservation.name, id);
      expect(record).toMatchObject({
        quantity: 2,
        cost: 120.5,
        validated: true,
        userLock: '04',
        items: [{ _id: items[0]._id, checked: true, comments: 'ok' }],
      });
      expect(new Date(record.dateIni).getTime()).toBe(
        new Date(body.dateIni).getTime(),
      );
    });

    it('creates and edits an activity', async () => {
      const body = {
        type: typeId,
        date: '2026-03-01T00:00:00.000',
        price: 35000,
        description: 'd',
        status: 'TODO',
      };
      const res = await http()
        .post('/api/activity')
        .set(auth())
        .send(body)
        .expect(201);
      const id = track(Activity.name, String(res.body._id));

      await http()
        .put(`/api/activity/${id}`)
        .set(auth())
        .send({ _id: id, ...body, status: 'COMPLETED' })
        .expect(200);

      expect(await stored(Activity.name, id)).toMatchObject({
        price: 35000,
        status: 'COMPLETED',
      });
    });

    it('creates and edits an activity type', async () => {
      const body = { name: 'Gas', description: 'd', budget: 10.5 };
      const res = await http()
        .post('/api/activity-type')
        .set(auth())
        .send(body)
        .expect(201);
      const id = track(ActivityType.name, String(res.body._id));

      await http()
        .put(`/api/activity-type/${id}`)
        .set(auth())
        .send({ _id: id, ...body, budget: 11 })
        .expect(200);

      expect(await stored(ActivityType.name, id)).toMatchObject({ budget: 11 });
    });

    it('creates and edits a lock code', async () => {
      const res = await http()
        .post('/api/locks')
        .set(auth())
        .send({ userNumber: '05', lock: '1234' })
        .expect(201);
      const id = track(Lock.name, String(res.body._id));

      await http()
        .put(`/api/locks/${id}`)
        .set(auth())
        .send({ _id: id, userNumber: '05', lock: '4321' })
        .expect(200);

      expect(await stored(Lock.name, id)).toMatchObject({
        userNumber: '05',
        lock: '4321',
      });
    });

    it('creates an account and changes its password', async () => {
      const body = user();
      const res = await http()
        .post('/api/users')
        .set(auth())
        .send(body)
        .expect(201);
      const id = track(User.name, String(res.body._id));

      await http()
        .put(`/api/users/${id}`)
        .set(auth())
        .send({
          name: 'Renamed',
          email: body.email,
          role: body.role,
          changePassword: true,
          password: 'new-pw',
          currentPassword: 'pw',
        })
        .expect(200);

      expect(await stored(User.name, id)).toMatchObject({ name: 'Renamed' });
    });

    it.each([
      (d: string) => d.slice(0, 10),
      (d: string) => d,
      (d: string) => d.replace('.000Z', '-05:00'),
    ])('accepts a reservation date written as form %#', async (form) => {
      const dates = stayDates();
      const res = await http()
        .post('/api/reservations')
        .set(auth())
        .send({
          ...reservation(),
          dateIni: form(dates.dateIni),
          dateEnd: form(dates.dateEnd),
        })
        .expect(201);
      track(Reservation.name, String(res.body._id));
    });
  });
});

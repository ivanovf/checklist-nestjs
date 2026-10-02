import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import * as request from 'supertest';

import { createTestApp } from '../security/app-factory';
import { seedAccounts, tokenFor } from '../support/auth-fixtures';
import { loadContract, Method, operations } from '../docs/openapi-contract';

/**
 * Every operation that answers with a stored record (specs/009-fix-unprojected-records).
 *
 * Regression suite for issue #9 (D3), where records were sent exactly as the database stored
 * them, the internal `__v` revision counter included, and nothing kept an unpublished field out.
 * Each answer, nested records included, must carry only what the contract publishes for it.
 */
interface Schema {
  $ref?: string;
  type?: string;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  nullable?: boolean;
  allOf?: Schema[];
  oneOf?: Schema[];
}

const contract = loadContract();
const schemas = contract.components.schemas as Record<string, Schema>;

const resolve = (schema: Schema): Schema => {
  if (schema.$ref) return schemas[schema.$ref.split('/').pop() as string];
  if (schema.allOf?.length === 1) {
    return { ...resolve(schema.allOf[0]), nullable: schema.nullable };
  }
  return schema;
};

/** Every place where `value` doesn't match `schema`, as readable paths. */
function mismatches(schema: Schema, value: unknown, at: string): string[] {
  const s = resolve(schema);

  if (value === null) {
    return s.nullable || schema.nullable ? [] : [`${at} is null`];
  }
  if (s.type === 'array' && s.items) {
    return Array.isArray(value)
      ? value.flatMap((v, i) => mismatches(s.items as Schema, v, `${at}[${i}]`))
      : [`${at} is not an array`];
  }
  if (!s.properties || typeof value !== 'object') {
    return [];
  }

  const body = value as Record<string, unknown>;
  const props = s.properties;
  return [
    ...Object.keys(body)
      .filter((k) => !(k in props))
      .map((k) => `${at}.${k} is not published`),
    ...(s.required ?? [])
      .filter((k) => !(k in body))
      .map((k) => `${at}.${k} is required but missing`),
    ...Object.keys(body)
      .filter((k) => k in props)
      .flatMap((k) => mismatches(props[k], body[k], `${at}.${k}`)),
  ];
}

/** Every key, at any depth, named `__v` or `password`. */
function internalKeys(value: unknown, at = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => internalKeys(v, `${at}[${i}]`));
  }
  if (value === null || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([k, v]) => [
    ...(k === '__v' || k === 'password' ? [`${at}.${k}`] : []),
    ...internalKeys(v, `${at}.${k}`),
  ]);
}

const successSchema = (method: Method, path: string): Schema => {
  const op = operations(contract).find(
    (o) => o.method === method && o.path === path,
  );
  if (!op) throw new Error(`${method} ${path} is not in the contract`);

  const status = Object.keys(op.op.responses).find((s) => /^2\d\d$/.test(s));
  const response = op.op.responses[status as string] as {
    content: Record<string, { schema: Schema }>;
  };
  return response.content['application/json'].schema;
};

const BODIES = {
  users: {
    email: 'fields@test.local',
    password: 'pw',
    name: 'n',
    role: 'authenticated',
  },
  userUpdate: {
    email: 'fields@test.local',
    password: 'pw',
    name: 'n2',
    role: 'authenticated',
    changePassword: false,
    currentPassword: 'pw',
  },
  items: { label: 'l', status: true, description: 'd', category: 'c' },
  reservations: {
    dateIni: '2026-01-01',
    dateEnd: '2026-01-02',
    type: 'direct',
    validated: false,
    contact: 'c',
    quantity: 1,
    items: [{ label: 'l', status: true, description: 'd', category: 'c' }],
  },
  locks: { lock: '1', userNumber: '2' },
  config: { doorLock: '1', mainLock: '2', usersLimit: 3, analogLecture: 0 },
  activityType: { name: 'n', budget: 1 },
};

interface Op {
  method: Method;
  /** In the contract's notation, e.g. `/api/items/:id`. */
  path: string;
  /** The URL to call, built once the records exist. */
  url: () => string;
  body?: () => object;
}

describe('Record answers (009)', () => {
  let app: INestApplication;
  let token: string;
  const ids: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  const create = async (path: string, body: object): Promise<string> => {
    const res = await http().post(path).set(auth()).send(body).expect(201);
    return res.body._id;
  };

  beforeAll(async () => {
    app = await createTestApp({ transport: true });
    const { admin } = await seedAccounts(app);
    token = await tokenFor(app, admin);

    ids.users = await create('/api/users', BODIES.users);
    ids.items = await create('/api/items', BODIES.items);
    ids.reservations = await create('/api/reservations', BODIES.reservations);
    ids.locks = await create('/api/locks', BODIES.locks);
    ids.config = await create('/api/config', BODIES.config);
    ids.activityType = await create('/api/activity-type', BODIES.activityType);
    ids.deletableType = await create('/api/activity-type', BODIES.activityType);
    ids.activity = await create('/api/activity', activityBody());
  });

  afterAll(async () => {
    await app?.close();
  });

  const activityBody = () => ({
    type: ids.activityType,
    status: 'TODO',
    price: 1,
    date: '2026-01-01',
    description: 'd',
  });

  const crud = (
    kind: string,
    body: () => object,
    update: () => object = body,
  ): Op[] => [
    { method: 'post', path: `/api/${kind}`, url: () => `/api/${kind}`, body },
    {
      method: 'get',
      path: `/api/${kind}/all`,
      url: () => `/api/${kind}/all`,
    },
    {
      method: 'get',
      path: `/api/${kind}/:id`,
      url: () => `/api/${kind}/${ids[kind]}`,
    },
    {
      method: 'put',
      path: `/api/${kind}/:id`,
      url: () => `/api/${kind}/${ids[kind]}`,
      body: update,
    },
  ];

  let created = 0;
  const OPS: Op[] = [
    ...crud(
      'users',
      () => ({ ...BODIES.users, email: `new${++created}@test.local` }),
      () => BODIES.userUpdate,
    ),
    ...crud('items', () => BODIES.items),
    // Each new reservation needs its own dates: overlapping ones are refused as unavailable.
    ...crud(
      'reservations',
      () => ({
        ...BODIES.reservations,
        dateIni: `${2030 + ++created}-01-01`,
        dateEnd: `${2030 + created}-01-02`,
      }),
      () => BODIES.reservations,
    ),
    ...crud('locks', () => BODIES.locks),
    {
      method: 'post',
      path: '/api/config',
      url: () => '/api/config',
      body: () => BODIES.config,
    },
    { method: 'get', path: '/api/config', url: () => '/api/config' },
    {
      method: 'put',
      path: '/api/config/:id',
      url: () => `/api/config/${ids.config}`,
      body: () => BODIES.config,
    },
    {
      method: 'patch',
      path: '/api/config/:id',
      url: () => `/api/config/${ids.config}`,
      body: () => ({
        analogLecture: 1,
        apiKey: process.env.TANK_API_KEY,
        time: 1,
      }),
    },
    {
      method: 'post',
      path: '/api/activity-type',
      url: () => '/api/activity-type',
      body: () => BODIES.activityType,
    },
    {
      method: 'get',
      path: '/api/activity-type',
      url: () => '/api/activity-type',
    },
    {
      method: 'get',
      path: '/api/activity-type/:id',
      url: () => `/api/activity-type/${ids.activityType}`,
    },
    {
      method: 'put',
      path: '/api/activity-type/:id',
      url: () => `/api/activity-type/${ids.activityType}`,
      body: () => BODIES.activityType,
    },
    {
      method: 'delete',
      path: '/api/activity-type/:id',
      url: () => `/api/activity-type/${ids.deletableType}`,
    },
    {
      method: 'post',
      path: '/api/activity',
      url: () => '/api/activity',
      body: activityBody,
    },
    { method: 'get', path: '/api/activity', url: () => '/api/activity' },
    {
      method: 'get',
      path: '/api/activity/:id',
      url: () => `/api/activity/${ids.activity}`,
    },
    {
      method: 'put',
      path: '/api/activity/:id',
      url: () => `/api/activity/${ids.activity}`,
      body: activityBody,
    },
  ];

  const call = (op: Op) => {
    const req = http()[op.method](op.url()).set(auth());
    return op.body ? req.send(op.body()) : req;
  };

  const label = (op: Op) => `${op.method.toUpperCase()} ${op.path}`;

  it('covers all 29 operations that answer with a stored record', () => {
    expect(OPS).toHaveLength(29);
  });

  // Each operation is called once and both checks read that one answer: a second DELETE would
  // be a 404, whose error body proves nothing about records.
  describe.each(OPS.map((op) => [label(op), op] as const))('%s', (_, op) => {
    let res: request.Response;

    beforeAll(async () => {
      res = await call(op);
    });

    it('answers only the fields the contract publishes', () => {
      expect(res.status).toBeLessThan(300);
      if (Array.isArray(res.body)) expect(res.body.length).toBeGreaterThan(0);
      expect(
        mismatches(successSchema(op.method, op.path), res.body, '$'),
      ).toEqual([]);
    });

    it('answers no internal field at any depth', () => {
      expect(res.status).toBeLessThan(300);
      expect(internalKeys(res.body)).toEqual([]);
    });
  });

  // A deleted activity type leaves its activities pointing at nothing. They are answered with
  // `type: null`, which the contract documents.
  it('answers an activity whose type was deleted with a null type', async () => {
    const type = await create('/api/activity-type', BODIES.activityType);
    const activity = await create('/api/activity', {
      ...activityBody(),
      type,
    });
    await http().delete(`/api/activity-type/${type}`).set(auth()).expect(200);

    const one = await http()
      .get(`/api/activity/${activity}`)
      .set(auth())
      .expect(200);
    // Filtered by the deleted type, so the activity is on the first page of a paged list.
    const list = await http()
      .get(`/api/activity?type=${type}`)
      .set(auth())
      .expect(200);

    expect(one.body.type).toBeNull();
    expect(list.body).toEqual([expect.objectContaining({ _id: activity })]);
    expect(list.body[0].type).toBeNull();
    expect(
      mismatches(successSchema('get', '/api/activity/:id'), one.body, '$'),
    ).toEqual([]);
  });

  /**
   * US2: an answer is built from the published list, not from what the store returns. Fields
   * written straight into the database, as a future schema change or an old record would hold
   * them, stay out.
   */
  describe('unpublished stored fields (US2)', () => {
    // The lowest possible ids, so each record is first on its list's first page.
    const itemId = new Types.ObjectId('000000000000000000000009');
    const userId = new Types.ObjectId('000000000000000000000009');
    const collection = (name: string) =>
      app.get<Connection>(getConnectionToken()).collection(name);

    // Otherwise exactly what the store writes, timestamps and `__v` included: these records are
    // first on shared lists other suites read, so the unpublished field must be their only quirk.
    const stored = () => {
      const now = new Date();
      return { createdAt: now, updatedAt: now, __v: 0 };
    };

    beforeAll(async () => {
      await collection('items').insertOne({
        _id: itemId,
        ...BODIES.items,
        checked: false,
        comments: '',
        ...stored(),
        internalNote: 'x',
      });
      await collection('users').insertOne({
        _id: userId,
        email: 'unpublished@test.local',
        name: 'n',
        role: 'authenticated',
        password: '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY',
        ...stored(),
        internalNote: 'x',
      });
    });

    it.each([
      ['GET /api/items/:id', () => `/api/items/${itemId}`],
      ['GET /api/items/all', () => '/api/items/all'],
      ['GET /api/users/:id', () => `/api/users/${userId}`],
      ['GET /api/users/all', () => '/api/users/all'],
    ])('%s leaves them out', async (_, url) => {
      const res = await http().get(url()).set(auth()).expect(200);
      const records = Array.isArray(res.body) ? res.body : [res.body];

      expect(records.map((r: { _id: string }) => r._id)).toContain(
        '000000000000000000000009',
      );
      expect(JSON.stringify(res.body)).not.toContain('internalNote');
      expect(internalKeys(res.body)).toEqual([]);
    });
  });
});

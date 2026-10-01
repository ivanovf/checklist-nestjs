import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as request from 'supertest';

import { ActivityType } from '../../src/activity-type/entities/activity-type.entity';
import { Config } from '../../src/config/entities/config.entity';
import { Item } from '../../src/items/entities/item.entity';
import { Lock } from '../../src/locks/entities/lock.entity';
import { User } from '../../src/users/entities/user.entity';
import { createTestApp } from '../security/app-factory';
import { seedAccounts, tokenFor } from '../support/auth-fixtures';

/**
 * Paging on every list that pages by position and reads oldest first.
 *
 * - Accounts, items and locks (specs/007-fix-list-paging-defaults): regression suite for
 *   issue #7 (discrepancy D1). Both values were required despite their documented defaults,
 *   `limit=0` returned every record, a negative `limit` was reinterpreted, there was no
 *   maximum, and `offset=-1` was a server error.
 * - Activity types and configurations (specs/011-fix-unbounded-lists): regression suite for
 *   issue #11 (discrepancy D6). Both lists returned their whole collection and silently
 *   ignored any paging value.
 *
 * The rules are the ones the reservation list uses (006). Activities page the same way but
 * read newest first; see test/activity/activity-paging.e2e-spec.ts.
 *
 * Fixture: exactly 15 records in each list. For accounts that means the 2 signed-in accounts
 * plus 13 more. The in-memory mongod is shared by the whole e2e run, so the collections are
 * cleared first.
 */
const ROUTES = [
  '/api/users/all',
  '/api/items/all',
  '/api/locks/all',
  '/api/activity-type',
  '/api/config',
];
const TOTAL = 15;

describe('List paging (007)', () => {
  let app: INestApplication;
  let token: string;
  let guestToken: string;
  const seeded: Record<string, string[]> = {};

  beforeAll(async () => {
    app = await createTestApp({ transport: true });

    const users = app.get<Model<User>>(getModelToken(User.name));
    const items = app.get<Model<Item>>(getModelToken(Item.name));
    const locks = app.get<Model<Lock>>(getModelToken(Lock.name));
    const types = app.get<Model<ActivityType>>(
      getModelToken(ActivityType.name),
    );
    const configs = app.get<Model<Config>>(getModelToken(Config.name));
    await Promise.all([
      users.deleteMany({}),
      items.deleteMany({}),
      locks.deleteMany({}),
      types.deleteMany({}),
      configs.deleteMany({}),
    ]);

    const { admin, guest } = await seedAccounts(app);
    token = await tokenFor(app, admin);
    guestToken = await tokenFor(app, guest);

    const idsOf = (docs: Array<{ _id: unknown }>) =>
      docs.map((doc) => String(doc._id));
    const n = (i: number) => String(i).padStart(2, '0');

    seeded['/api/users/all'] = [
      admin.id,
      guest.id,
      ...idsOf(
        await users.insertMany(
          Array.from({ length: TOTAL - 2 }, (_, i) => ({
            email: `u${n(i)}@test.local`,
            name: `user ${n(i)}`,
            role: 'authenticated',
            // Never used to sign in; the list only has to hold the record.
            password:
              '$2b$10$synthetic.placeholder.hash.value.for.paging.tests',
          })),
        ),
      ),
    ];
    seeded['/api/items/all'] = idsOf(
      await items.insertMany(
        Array.from({ length: TOTAL }, (_, i) => ({
          label: `item-${n(i)}`,
          status: true,
          description: 'd',
          category: 'c',
        })),
      ),
    );
    seeded['/api/locks/all'] = idsOf(
      await locks.insertMany(
        Array.from({ length: TOTAL }, (_, i) => ({
          lock: `lock-${n(i)}`,
          userNumber: `10${n(i)}`,
        })),
      ),
    );
    seeded['/api/activity-type'] = idsOf(
      await types.insertMany(
        Array.from({ length: TOTAL }, (_, i) => ({
          name: `type-${n(i)}`,
          budget: i,
        })),
      ),
    );
    seeded['/api/config'] = idsOf(
      await configs.insertMany(
        Array.from({ length: TOTAL }, (_, i) => ({
          doorLock: `door-${n(i)}`,
          mainLock: `main-${n(i)}`,
          usersLimit: 20,
        })),
      ),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (route: string, query: string, auth = true) => {
    const req = request(app.getHttpServer()).get(
      query ? `${route}?${query}` : route,
    );

    return auth ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  type Row = { _id: string; password?: unknown };
  const rows = (res: request.Response) => res.body as Row[];
  const ids = (res: request.Response) => rows(res).map((row) => row._id);
  const messages = (res: request.Response) => res.body.message as string[];

  describe.each(ROUTES)('%s', (route) => {
    it('answers explicit in-range values', async () => {
      const res = await get(route, 'limit=10&offset=0').expect(200);

      expect(rows(res)).toHaveLength(10);
    });

    describe('US1: optional paging values', () => {
      it.each([
        ['', 10],
        ['offset=10', 5],
        ['limit=5', 5],
        ['offset=0', 10],
      ])('?%s answers %i records', async (query, count) => {
        const res = await get(route, query).expect(200);

        expect(rows(res)).toHaveLength(count);
      });
    });

    describe('US2: stable pages', () => {
      it('pages of 5 return every record once, oldest first', async () => {
        const seen: string[] = [];
        for (const offset of [0, 5, 10]) {
          const res = await get(route, `limit=5&offset=${offset}`).expect(200);
          expect(rows(res)).toHaveLength(5);
          seen.push(...ids(res));
        }

        expect(seen).toEqual(seeded[route]);
      });

      it('a page past the end is empty', async () => {
        const res = await get(route, 'offset=20').expect(200);

        expect(res.body).toEqual([]);
      });
    });

    describe('US3: refusals', () => {
      it.each([
        'limit=0',
        'limit=-5',
        'limit=2.5',
        'limit=abc',
        'limit=',
        'limit=51',
        'limit=1000',
        'limit=5&limit=7',
      ])('refuses %s, naming limit', async (query) => {
        const res = await get(route, query).expect(400);

        expect(messages(res).some((m) => m.includes('limit'))).toBe(true);
      });

      it('names the maximum', async () => {
        const res = await get(route, 'limit=1000').expect(400);

        expect(messages(res).some((m) => m.includes('50'))).toBe(true);
      });

      it.each(['offset=-1', 'offset=abc', 'offset=2.5', 'offset=0&offset=5'])(
        'refuses %s with 400, naming offset',
        async (query) => {
          const res = await get(route, query).expect(400);

          expect(messages(res).some((m) => m.includes('offset'))).toBe(true);
        },
      );

      it('answers a huge offset with an empty page, not a server error', async () => {
        const res = await get(route, 'offset=99999999999999999999').expect(200);

        expect(res.body).toEqual([]);
      });

      it('treats an empty offset as the start', async () => {
        const res = await get(route, 'offset=').expect(200);

        expect(rows(res)).toHaveLength(10);
      });

      it('accepts the maximum page size', async () => {
        const res = await get(route, 'limit=50').expect(200);

        expect(rows(res)).toHaveLength(TOTAL);
      });

      it('still refuses an anonymous caller first', async () => {
        await get(route, 'limit=10&offset=0', false).expect(401);
      });
    });
  });

  it('checks permission before the paging values on the activity type list', async () => {
    // Administrators only: a standard account is refused as forbidden, never as a bad
    // request, whatever it sends (spec edge case; analysis C1).
    await request(app.getHttpServer())
      .get('/api/activity-type?limit=0')
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(403);
  });

  it('never exposes a password on the account list', async () => {
    const res = await get('/api/users/all', 'limit=50').expect(200);

    expect(rows(res).every((row) => row.password === undefined)).toBe(true);
  });
});

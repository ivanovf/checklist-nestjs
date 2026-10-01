import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as request from 'supertest';

import { Activity } from '../../src/activity/entities/activity.entity';
import { ActivityStatus } from '../../src/activity/entities/activity-status.enum';
import { ActivityType } from '../../src/activity-type/entities/activity-type.entity';
import { createTestApp } from '../security/app-factory';
import { seedAccounts, tokenFor } from '../support/auth-fixtures';

/**
 * Paging on the activity list (specs/011-fix-unbounded-lists).
 *
 * Regression suite for issue #11 (discrepancy D6). Observed on 2026-10-01, the list returned
 * the whole collection and silently ignored `limit` and `offset`, and activities sharing a
 * date came back in no fixed order. The route bound its query through the global pipe, which
 * hands the handler the raw query, so a paging default could never have reached it (the D11
 * trap; research R1).
 *
 * Fixture: 15 activities inserted one by one, so `_id` grows with insertion. They fall on 5
 * dates, 3 per date, so every date has a tie. The required order is newest date first, then
 * newest created first (research R4). Inside a date, insertion order is the opposite, so the
 * natural order cannot satisfy it by accident.
 */
const TOTAL = 15;

interface Seeded {
  id: string;
  date: Date;
  type: string;
  status: ActivityStatus;
  price: number;
}

describe('Activity list paging (011)', () => {
  let app: INestApplication;
  let admin: string;
  let guest: string;
  let typeA: string;
  let expected: Seeded[];

  beforeAll(async () => {
    app = await createTestApp({ transport: true });

    const activities = app.get<Model<Activity>>(getModelToken(Activity.name));
    const types = app.get<Model<ActivityType>>(
      getModelToken(ActivityType.name),
    );
    await Promise.all([activities.deleteMany({}), types.deleteMany({})]);

    const accounts = await seedAccounts(app);
    admin = await tokenFor(app, accounts.admin);
    guest = await tokenFor(app, accounts.guest);

    const typeIds: string[] = [];
    for (const name of ['A', 'B', 'C']) {
      typeIds.push(String((await types.create({ name, budget: 1 }))._id));
    }
    typeA = typeIds[0];

    const seeded: Seeded[] = [];
    for (let i = 0; i < TOTAL; i++) {
      const record = {
        date: new Date(Date.UTC(2026, 0, 1 + (i % 5))),
        type: typeIds[i % 3],
        status: i < 8 ? ActivityStatus.TODO : ActivityStatus.COMPLETED,
        price: i % 4 === 0 ? 0 : 1,
      };
      const created = await activities.create(record);
      seeded.push({ id: String(created._id), ...record });
    }

    expected = [...seeded].sort(
      (a, b) => b.date.getTime() - a.date.getTime() || (a.id < b.id ? 1 : -1),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (query: string, token: string | null = admin) => {
    const req = request(app.getHttpServer()).get(
      query ? `/api/activity?${query}` : '/api/activity',
    );

    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  type Row = { _id: string; type: { name?: string } };
  const rows = (res: request.Response) => res.body as Row[];
  const ids = (res: request.Response) => rows(res).map((row) => row._id);
  const messages = (res: request.Response) => res.body.message as string[];
  const idsWhere = (match: (s: Seeded) => boolean) =>
    expected.filter(match).map((s) => s.id);

  describe('US1: bounded', () => {
    it.each([
      ['', 10],
      ['limit=5', 5],
      ['offset=10', 5],
    ])('?%s answers %i activities', async (query, count) => {
      const res = await get(query).expect(200);

      expect(rows(res)).toHaveLength(count);
    });

    it('bounds the list for a standard account too', async () => {
      const res = await get('', guest).expect(200);

      expect(rows(res)).toHaveLength(10);
    });

    it('still carries each activity type in full', async () => {
      const res = await get('').expect(200);

      expect(rows(res).every((row) => typeof row.type?.name === 'string')).toBe(
        true,
      );
    });
  });

  describe('US2: stable pages', () => {
    it('the first page is the 10 newest, ties newest created first', async () => {
      const res = await get('').expect(200);

      expect(ids(res)).toEqual(expected.slice(0, 10).map((s) => s.id));
    });

    it('pages of 5 return every activity once, in order', async () => {
      const seen: string[] = [];
      for (const offset of [0, 5, 10]) {
        const res = await get(`limit=5&offset=${offset}`).expect(200);
        expect(rows(res)).toHaveLength(5);
        seen.push(...ids(res));
      }

      expect(seen).toEqual(expected.map((s) => s.id));
    });

    it('a page past the end is empty', async () => {
      const res = await get('offset=20').expect(200);

      expect(res.body).toEqual([]);
    });

    it('pages within a status filter', async () => {
      const first = await get('status=TODO&limit=5').expect(200);
      const second = await get('status=TODO&limit=5&offset=5').expect(200);

      expect(rows(first)).toHaveLength(5);
      expect(rows(second)).toHaveLength(3);
      expect([...ids(first), ...ids(second)]).toEqual(
        idsWhere((s) => s.status === ActivityStatus.TODO),
      );
    });

    it('pages within a type filter', async () => {
      const first = await get(`type=${typeA}&limit=3`).expect(200);
      const second = await get(`type=${typeA}&limit=3&offset=3`).expect(200);

      expect(rows(first)).toHaveLength(3);
      expect(rows(second)).toHaveLength(2);
      expect([...ids(first), ...ids(second)]).toEqual(
        idsWhere((s) => s.type === typeA),
      );
    });

    it('filters by a price of 0', async () => {
      // The handler used to receive the raw string '0', which is truthy. Once converted to a
      // number, a truthiness check would skip it and return every activity (observed
      // 2026-10-01 while implementing; research R8).
      const res = await get('price=0&limit=50').expect(200);

      expect(ids(res)).toEqual(idsWhere((s) => s.price === 0));
    });

    it('applies a price filter before the page', async () => {
      const res = await get('price=1&limit=50').expect(200);

      expect(ids(res)).toEqual(idsWhere((s) => s.price === 1));
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
      const res = await get(query).expect(400);

      expect(messages(res).some((m) => m.includes('limit'))).toBe(true);
    });

    it('names the maximum', async () => {
      const res = await get('limit=1000').expect(400);

      expect(messages(res).some((m) => m.includes('50'))).toBe(true);
    });

    it.each(['offset=-1', 'offset=abc', 'offset=2.5'])(
      'refuses %s, naming offset',
      async (query) => {
        const res = await get(query).expect(400);

        expect(messages(res).some((m) => m.includes('offset'))).toBe(true);
      },
    );

    it('treats an empty offset as the start', async () => {
      const res = await get('offset=').expect(200);

      expect(rows(res)).toHaveLength(10);
    });

    it('accepts the maximum page size', async () => {
      const res = await get('limit=50').expect(200);

      expect(rows(res)).toHaveLength(TOTAL);
    });

    it('still validates the filters alongside paging', async () => {
      const res = await get('status=bogus&limit=5').expect(400);

      expect(messages(res).some((m) => m.startsWith('status'))).toBe(true);
    });

    it('still refuses an anonymous caller first', async () => {
      await get('limit=5', null).expect(401);
    });
  });
});

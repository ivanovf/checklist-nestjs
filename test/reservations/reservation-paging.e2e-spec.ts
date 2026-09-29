import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as request from 'supertest';

import { Reservation } from '../../src/reservations/entities/reservation.entity';
import { createTestApp } from '../security/app-factory';
import { seedAccounts, tokenFor } from '../support/auth-fixtures';

/**
 * GET /api/reservations/all paging, filters and refusals (specs/006-fix-reservation-paging).
 *
 * Regression suite for issue #16 (discrepancy D11) and for the defects found with it: the
 * list was unbounded without paging values, defaulted to ascending order, and treated
 * `old=false` like `old=true`.
 *
 * Fixture: exactly 25 synthetic reservations, and every assertion below depends on these
 * counts.
 *   - dateIni   2026-01-01 … 2026-01-05, 5 per date, so the sort key has ties
 *   - type      15 direct (i 0–14), 5 airbnb (i 15–19), 5 booking (i 20–24), each group
 *               spread over all five dates
 *   - dateEnd   10 past (i 0–9, 2026-01-10) and 15 future (2027-01-10)
 *   - validated 8 true (i % 3 === 1), 17 false
 *
 * The in-memory mongod is shared by the whole e2e run, so the collection is cleared first.
 */
describe('GET /api/reservations/all paging (006)', () => {
  let app: INestApplication;
  let token: string;
  let allIds: string[];

  const TOTAL = 25;

  beforeAll(async () => {
    app = await createTestApp({ transport: true });
    const { admin } = await seedAccounts(app);
    token = await tokenFor(app, admin);

    const model = app.get<Model<Reservation>>(getModelToken(Reservation.name));
    await model.deleteMany({});
    const created = await model.insertMany(
      Array.from({ length: TOTAL }, (_, i) => ({
        dateIni: new Date(Date.UTC(2026, 0, 1 + (i % 5))),
        dateEnd: new Date(Date.UTC(i < 10 ? 2026 : 2027, 0, 10)),
        type: i < 15 ? 'direct' : i < 20 ? 'airbnb' : 'booking',
        validated: i % 3 === 1,
        contact: `c${i}`,
        quantity: 1,
      })),
    );
    allIds = created.map((doc) => String(doc._id));
  });

  afterAll(async () => {
    await app?.close();
  });

  const list = (query: string, auth = true) => {
    const req = request(app.getHttpServer()).get(
      `/api/reservations/all${query ? `?${query}` : ''}`,
    );

    return auth ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  type Row = { _id: string; dateIni: string; type: string };
  const rows = (res: request.Response) => res.body as Row[];
  const ids = (res: request.Response) => rows(res).map((row) => row._id);
  const starts = (res: request.Response) =>
    rows(res).map((row) => new Date(row.dateIni).getTime());

  const isNonIncreasing = (xs: number[]) =>
    xs.every((x, i) => i === 0 || xs[i - 1] >= x);
  const isNonDecreasing = (xs: number[]) =>
    xs.every((x, i) => i === 0 || xs[i - 1] <= x);

  /** Every id across the pages, in page order. */
  const collect = async (query: string, size: number, pages: number) => {
    const seen: string[] = [];
    for (let page = 0; page < pages; page++) {
      const res = await list(
        `${query}${query ? '&' : ''}limit=${size}&offset=${page * size}`,
      ).expect(200);
      seen.push(...ids(res));
    }

    return seen;
  };

  const messages = (res: request.Response) => res.body.message as string[];

  it('answers a request without query values', async () => {
    await list('').expect(200);
  });

  describe('Phase 2 regression', () => {
    it('old=false does not filter to past stays', async () => {
      const res = await list('old=false&limit=50').expect(200);

      expect(rows(res)).toHaveLength(TOTAL);
    });
  });

  describe('US1: read any page', () => {
    it('without paging values, returns one default page of 10, newest first', async () => {
      const res = await list('').expect(200);

      expect(rows(res)).toHaveLength(10);
      expect(isNonIncreasing(starts(res))).toBe(true);
    });

    it('pages of 10 at 0, 10 and 20 hold 10, 10 and 5 reservations', async () => {
      const lengths = await Promise.all(
        [0, 10, 20].map(
          async (offset) =>
            rows(await list(`limit=10&offset=${offset}`).expect(200)).length,
        ),
      );

      expect(lengths).toEqual([10, 10, 5]);
    });

    it.each([10, 5, 3])(
      'pages of %i cover every reservation exactly once',
      async (size) => {
        const seen = await collect('', size, Math.ceil(TOTAL / size));

        expect(seen).toHaveLength(TOTAL);
        expect(new Set(seen).size).toBe(TOTAL);
        expect([...seen].sort()).toEqual([...allIds].sort());
      },
    );

    it('a page past the end is empty', async () => {
      const res = await list('offset=30').expect(200);

      expect(res.body).toEqual([]);
    });

    it('answers the originally reported call once the size is within the maximum', async () => {
      const res = await list('sort=asc&limit=50&offset=0').expect(200);

      expect(rows(res)).toHaveLength(TOTAL);
      expect(isNonDecreasing(starts(res))).toBe(true);
    });

    it('defaults the value that is not supplied', async () => {
      expect(rows(await list('limit=5').expect(200))).toHaveLength(5);
      expect(rows(await list('offset=20').expect(200))).toHaveLength(5);
    });

    it('defaults to descending order', async () => {
      const byDefault = await list('').expect(200);
      const explicit = await list('sort=desc&limit=10&offset=0').expect(200);

      expect(ids(byDefault)).toEqual(ids(explicit));
    });
  });

  describe('US2: page through a filtered list', () => {
    it('pages through one type only', async () => {
      const first = await list('type=direct&limit=10&offset=0').expect(200);
      const second = await list('type=direct&limit=10&offset=10').expect(200);
      const both = [...rows(first), ...rows(second)];

      expect(rows(first)).toHaveLength(10);
      expect(rows(second)).toHaveLength(5);
      expect(both.every((row) => row.type === 'direct')).toBe(true);
      expect(new Set(both.map((row) => row._id)).size).toBe(15);
    });

    it('old=true keeps only the past stays', async () => {
      expect(rows(await list('old=true&limit=50').expect(200))).toHaveLength(
        10,
      );
    });

    it('old=false keeps every reservation', async () => {
      expect(rows(await list('old=false&limit=50').expect(200))).toHaveLength(
        TOTAL,
      );
    });

    it.each([
      ['true', 8],
      ['false', 17],
    ])('validated=%s keeps %i reservations', async (value, count) => {
      const res = await list(`validated=${value}&limit=50`).expect(200);

      expect(rows(res)).toHaveLength(count);
    });

    it('combines a type, ascending order and paging', async () => {
      const res = await list('type=direct&sort=asc&limit=5&offset=5').expect(
        200,
      );

      expect(rows(res)).toHaveLength(5);
      expect(rows(res).every((row) => row.type === 'direct')).toBe(true);
      expect(isNonDecreasing(starts(res))).toBe(true);
    });

    it('combines a start-date bound and paging', async () => {
      const from = '2026-01-03T00:00:00.000Z';
      const res = await list(`dateFrom=${from}&limit=50`).expect(200);

      expect(rows(res)).toHaveLength(15);
      expect(
        starts(res).every((start) => start >= new Date(from).getTime()),
      ).toBe(true);
    });
  });

  describe('US3: clear refusals', () => {
    it('refuses the originally reported limit=200, naming the maximum', async () => {
      const res = await list('sort=asc&limit=200&offset=0').expect(400);

      expect(
        messages(res).some((m) => m.includes('limit') && m.includes('50')),
      ).toBe(true);
    });

    it.each([
      'limit=0',
      'limit=-1',
      'limit=2.5',
      'limit=abc',
      'limit=51',
      'limit=5&limit=7',
    ])('refuses %s, naming limit', async (query) => {
      const res = await list(query).expect(400);

      expect(messages(res).some((m) => m.includes('limit'))).toBe(true);
    });

    it.each(['offset=-1', 'offset=abc'])(
      'refuses %s, naming offset',
      async (query) => {
        const res = await list(query).expect(400);

        expect(messages(res).some((m) => m.includes('offset'))).toBe(true);
      },
    );

    it.each([
      ['old=yes', 'old'],
      ['validated=1', 'validated'],
    ])('refuses %s, naming the flag', async (query, field) => {
      const res = await list(query).expect(400);

      expect(messages(res).some((m) => m.includes(field))).toBe(true);
    });

    it('accepts the maximum page size', async () => {
      await list('limit=50').expect(200);
    });

    it('still refuses an anonymous caller first', async () => {
      await list('limit=10&offset=0', false).expect(401);
    });
  });
});

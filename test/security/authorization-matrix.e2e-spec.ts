import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { createTestApp } from './app-factory';
import { AUTHORIZATION_MATRIX, RouteRule } from './authorization-matrix';
import {
  seedAccounts,
  tokenFor,
  setRole,
  SeededAccount,
} from '../support/auth-fixtures';
import { Role } from '../../src/auth/models/role.model';

/**
 * User Story 1 — role restrictions are actually enforced.
 *
 * Drives every route in the authorization contract as all three caller types. Before this
 * feature, 24 of 37 routes did not enforce the access they declared.
 */
describe('Authorization matrix', () => {
  let app: INestApplication;
  let admin: SeededAccount;
  let guest: SeededAccount;
  let adminToken: string;
  let guestToken: string;

  const OBJECT_ID = '507f1f77bcf86cd799439011';
  const url = (rule: RouteRule) => rule.path.replace(':id', OBJECT_ID);
  const call = (rule: RouteRule, token?: string) => {
    const req = request(app.getHttpServer())[rule.method](url(rule));
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedAccounts(app);
    admin = seeded.admin;
    guest = seeded.guest;
    adminToken = await tokenFor(app, admin);
    guestToken = await tokenFor(app, guest);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('anonymous callers', () => {
    it.each(AUTHORIZATION_MATRIX.filter((r) => r.access !== 'public'))(
      'row $row: $method $path is refused',
      async (rule) => {
        const res = await call(rule);
        expect(res.status).toBe(401);
      },
    );

    it.each(AUTHORIZATION_MATRIX.filter((r) => r.access === 'public'))(
      'row $row: $method $path is reachable without a token',
      async (rule) => {
        // Public means the guard chain does not refuse it. The sign-in route is public but
        // still evaluates the credentials in its body, so it is exercised with real ones.
        const res =
          rule.path === '/api/login'
            ? await call(rule).send({
                email: admin.email,
                password: admin.password,
              })
            : await call(rule);

        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      },
    );
  });

  describe('authenticated (non-administrator) callers', () => {
    it.each(AUTHORIZATION_MATRIX.filter((r) => r.access === 'admin'))(
      'row $row: $method $path is forbidden',
      async (rule) => {
        const res = await call(rule, guestToken);
        expect(res.status).toBe(403);
      },
    );

    it.each(AUTHORIZATION_MATRIX.filter((r) => r.access === 'auth'))(
      'row $row: $method $path is permitted',
      async (rule) => {
        const res = await call(rule, guestToken);
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      },
    );
  });

  describe('administrator callers', () => {
    it.each(
      AUTHORIZATION_MATRIX.filter(
        (r) => r.access === 'admin' || r.access === 'auth',
      ),
    )('row $row: $method $path is permitted', async (rule) => {
      const res = await call(rule, adminToken);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  // FR-005 — authorization reflects the account's current role, not the token's claim.
  describe('current-role resolution', () => {
    it('refuses an administrator token after the account is demoted', async () => {
      const demoted = await seedAccounts(app);
      const token = await tokenFor(app, demoted.admin);

      const before = await request(app.getHttpServer())
        .delete(`/api/reservations/${OBJECT_ID}`)
        .set('Authorization', `Bearer ${token}`);
      expect(before.status).not.toBe(403);

      await setRole(app, demoted.admin, Role.AUTHENTICATED);

      const after = await request(app.getHttpServer())
        .delete(`/api/reservations/${OBJECT_ID}`)
        .set('Authorization', `Bearer ${token}`);
      expect(after.status).toBe(403);
    });
  });

  // The contract must stay exhaustive: an endpoint added without a matrix row fails here.
  describe('contract completeness', () => {
    it('every registered route appears in the authorization matrix', () => {
      const server = app.getHttpAdapter().getInstance();
      const registered = server._router.stack
        .filter((layer: { route?: unknown }) => layer.route)
        .flatMap(
          (layer: {
            route: { path: string; methods: Record<string, boolean> };
          }) =>
            Object.keys(layer.route.methods).map(
              (m) => `${m.toLowerCase()} ${layer.route.path}`,
            ),
        )
        .filter((r: string) => !r.includes('*'));

      const declared = new Set(
        AUTHORIZATION_MATRIX.map((r) => `${r.method} ${r.path}`),
      );

      const undeclared = registered.filter((r: string) => !declared.has(r));
      expect(undeclared).toEqual([]);
      expect(registered.length).toBe(AUTHORIZATION_MATRIX.length);
    });
  });
});

import { Role } from '../../src/auth/models/role.model';

export type Access = 'public' | 'auth' | 'admin' | 'device';

export interface RouteRule {
  row: number;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  access: Access;
}

/**
 * The authorization contract, transcribed from
 * specs/001-api-security-hardening/contracts/authorization-matrix.md.
 *
 * This is the single source of truth the suite asserts against. A route the application
 * registers that is absent here fails the build — that is what stops the next endpoint from
 * repeating the defect this feature exists to fix.
 */
export const AUTHORIZATION_MATRIX: RouteRule[] = [
  { row: 1, method: 'get', path: '/api', access: 'public' },

  { row: 2, method: 'post', path: '/api/login', access: 'public' },
  { row: 3, method: 'get', path: '/api/login/validate', access: 'auth' },

  { row: 4, method: 'post', path: '/api/reservations', access: 'admin' },
  { row: 5, method: 'get', path: '/api/reservations/all', access: 'auth' },
  { row: 6, method: 'get', path: '/api/reservations/:id', access: 'auth' },
  { row: 7, method: 'put', path: '/api/reservations/:id', access: 'auth' },
  { row: 8, method: 'delete', path: '/api/reservations/:id', access: 'admin' },

  { row: 9, method: 'post', path: '/api/users', access: 'admin' },
  { row: 10, method: 'get', path: '/api/users/all', access: 'auth' },
  { row: 11, method: 'get', path: '/api/users/:id', access: 'auth' },
  { row: 12, method: 'put', path: '/api/users/:id', access: 'auth' },
  { row: 13, method: 'delete', path: '/api/users/:id', access: 'admin' },

  { row: 14, method: 'post', path: '/api/config', access: 'admin' },
  { row: 15, method: 'get', path: '/api/config', access: 'auth' },
  { row: 16, method: 'put', path: '/api/config/:id', access: 'admin' },
  { row: 17, method: 'patch', path: '/api/config/:id', access: 'device' },

  { row: 18, method: 'post', path: '/api/activity-type', access: 'admin' },
  { row: 19, method: 'get', path: '/api/activity-type', access: 'admin' },
  { row: 20, method: 'get', path: '/api/activity-type/:id', access: 'admin' },
  { row: 21, method: 'put', path: '/api/activity-type/:id', access: 'admin' },
  {
    row: 22,
    method: 'delete',
    path: '/api/activity-type/:id',
    access: 'admin',
  },

  { row: 23, method: 'post', path: '/api/activity', access: 'admin' },
  { row: 24, method: 'get', path: '/api/activity', access: 'auth' },
  { row: 25, method: 'get', path: '/api/activity/:id', access: 'auth' },
  { row: 26, method: 'put', path: '/api/activity/:id', access: 'auth' },
  { row: 27, method: 'delete', path: '/api/activity/:id', access: 'admin' },

  { row: 28, method: 'post', path: '/api/items', access: 'admin' },
  { row: 29, method: 'get', path: '/api/items/all', access: 'auth' },
  { row: 30, method: 'get', path: '/api/items/:id', access: 'auth' },
  { row: 31, method: 'put', path: '/api/items/:id', access: 'admin' },
  { row: 32, method: 'delete', path: '/api/items/:id', access: 'admin' },

  { row: 33, method: 'post', path: '/api/locks', access: 'admin' },
  { row: 34, method: 'get', path: '/api/locks/all', access: 'auth' },
  { row: 35, method: 'get', path: '/api/locks/:id', access: 'auth' },
  { row: 36, method: 'put', path: '/api/locks/:id', access: 'admin' },
  { row: 37, method: 'delete', path: '/api/locks/:id', access: 'admin' },

  // Row 38 originates in feature 002, not the 001 contract: see
  // specs/002-fix-vercel-deploy/contracts/health-endpoint.md. Public by design, because
  // deploy verification runs before any credential exists, and the route discloses only
  // two availability labels.
  { row: 38, method: 'get', path: '/api/health', access: 'public' },

  // Rows 39–40 originate in feature 012, not the 001 contract: see
  // specs/012-password-recovery/contracts/password-recovery.md. Issuing a recovery code is an
  // administrator action; completing one is public by design, because its caller has lost
  // their password and holds the code instead.
  {
    row: 39,
    method: 'post',
    path: '/api/password-recovery/:userId/code',
    access: 'admin',
  },
  {
    row: 40,
    method: 'post',
    path: '/api/password-recovery/complete',
    access: 'public',
  },
];

/** Roles permitted to reach a route, for the authenticated cases. */
export const permittedRoles = (access: Access): Role[] =>
  access === 'admin' ? [Role.ADMIN] : [Role.ADMIN, Role.AUTHENTICATED];

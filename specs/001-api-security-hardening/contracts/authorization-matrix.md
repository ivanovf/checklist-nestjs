# Contract: Authorization Matrix

**Feature**: `001-api-security-hardening` | **Date**: 2026-09-07

This table is the authoritative access-control contract for the service. It is the fixture that
the US1 end-to-end suite is driven from (research R12).

**Two properties the test suite MUST enforce:**

1. For every row, an anonymous caller, a `authenticated` caller, and an `admin` caller each receive
   the outcome this table states.
2. The set of routes the application registers at runtime MUST equal the set of routes in this
   table. A route added without a row here fails the build — this is what stops the next endpoint
   from repeating the current defect.

All paths are prefixed with the global `api` prefix set in `main.ts`.

**Legend** — `admin`: administrator only. `auth`: any authenticated account. `public`: no
credentials required. `device`: no account, but a valid configured API key required.

---

## Current state vs. target

| # | Method | Path | Required access | Enforced today? | Change |
|---|---|---|---|---|---|
| 1 | GET | `/api` | public | n/a — no guard | Mark `@Public` explicitly |
| **Authentication** |
| 2 | POST | `/api/login` | public | yes — local strategy | Add throttling (US3) |
| 3 | GET | `/api/login/validate` | auth | yes — jwt + roles | none |
| **Reservations** — *role checks currently inert* |
| 4 | POST | `/api/reservations` | admin | **NO** | Enforced by global `RolesGuard` |
| 5 | GET | `/api/reservations/all` | auth | **NO** | Enforced |
| 6 | GET | `/api/reservations/:id` | auth | **NO** | Enforced |
| 7 | PUT | `/api/reservations/:id` | auth | **NO** | Enforced |
| 8 | DELETE | `/api/reservations/:id` | admin | **NO** | Enforced |
| **Users** — *role checks currently inert* |
| 9 | POST | `/api/users` | admin | **NO** | Enforced |
| 10 | GET | `/api/users/all` | auth | **NO** | Enforced |
| 11 | GET | `/api/users/:id` | auth | **NO** | Enforced |
| 12 | PUT | `/api/users/:id` | auth | **NO** | Enforced |
| 13 | DELETE | `/api/users/:id` | admin | **NO** | Enforced |
| **Config** — *role checks currently inert; one route fully open* |
| 14 | POST | `/api/config` | admin | **NO** | Enforced |
| 15 | GET | `/api/config` | auth | **NO** | Enforced |
| 16 | PUT | `/api/config/:id` | admin | **NO** | Enforced |
| 17 | PATCH | `/api/config/:id` | **device** | **NO — no guard at all** | `ApiKeyGuard` against `TANK_API_KEY` (research R4) |
| **Activity Type** — *class-level role, invisible to the current guard* |
| 18 | POST | `/api/activity-type` | admin | **NO** | Enforced, requires `getAllAndOverride` fix (R2) |
| 19 | GET | `/api/activity-type` | admin | **NO** | Enforced |
| 20 | GET | `/api/activity-type/:id` | admin | **NO** | Enforced |
| 21 | PUT | `/api/activity-type/:id` | admin | **NO** | Enforced |
| 22 | DELETE | `/api/activity-type/:id` | admin | **NO** | Enforced |
| **Activity** — *declares no roles at all* |
| 23 | POST | `/api/activity` | admin | no roles declared | **Declaration required — see below** |
| 24 | GET | `/api/activity` | auth | no roles declared | **Declaration required** |
| 25 | GET | `/api/activity/:id` | auth | no roles declared | **Declaration required** |
| 26 | PUT | `/api/activity/:id` | auth | no roles declared | **Declaration required** |
| 27 | DELETE | `/api/activity/:id` | admin | no roles declared | **Declaration required** |
| **Items** — *already enforced* |
| 28 | POST | `/api/items` | admin | yes | none |
| 29 | GET | `/api/items/all` | auth | yes | none |
| 30 | GET | `/api/items/:id` | auth | yes | none |
| 31 | PUT | `/api/items/:id` | admin | yes | none |
| 32 | DELETE | `/api/items/:id` | admin | yes | none |
| **Locks** — *already enforced* |
| 33 | POST | `/api/locks` | admin | yes | none |
| 34 | GET | `/api/locks/all` | auth | yes | none |
| 35 | GET | `/api/locks/:id` | auth | yes | none |
| 36 | PUT | `/api/locks/:id` | admin | yes | none |
| 37 | DELETE | `/api/locks/:id` | admin | yes | none |

**24 of 37 routes are not enforcing the access level they appear to declare.**

### Note on rows 23–27 (Activity)

`ActivityController` declares no `@Roles` metadata on any route, so unlike the other gaps this is
not an inert declaration — there is nothing to enforce. The required access shown above mirrors the
pattern every other resource follows (writes and deletes are administrator-only, reads are open to
any authenticated account). Applying that pattern is a deliberate choice, not a discovered rule.
If activities are meant to be guest-writable, say so and rows 23 and 27 change; otherwise this is
the assumption the implementation proceeds on.

### Note on row 17 (tank level)

This is the only unauthenticated write endpoint in the service and it was made public
deliberately, per the git history, for a device integration. It does not become account-protected —
the device cannot sign in — but it stops being open to the world. See research R4.

---

## Expected responses

| Caller | Route requires | Expected |
|---|---|---|
| anonymous | `auth` or `admin` | `401`, no side effect |
| anonymous | `public` | normal response |
| anonymous | `device`, no/incorrect key | `401`, no side effect |
| anonymous | `device`, correct key | normal response |
| `authenticated` | `auth` | normal response |
| `authenticated` | `admin` | `403`, **no side effect** — the operation must not partially apply |
| `admin` | `auth` or `admin` | normal response |
| any | credential valid but role unknown/absent | `403` (FR-004) |
| any, role changed since sign-in | evaluated against current stored role | per current role (FR-005) |

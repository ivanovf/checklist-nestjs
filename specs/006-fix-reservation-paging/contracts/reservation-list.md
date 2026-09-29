# Contract: `GET /api/reservations/all`

**Feature**: `specs/006-fix-reservation-paging` | Source of truth after merge: `openapi.json`
(regenerated with `pnpm docs:export`)

Access is unchanged: a bearer token with role `admin` or `authenticated`. Documented refusals
are unchanged: **400, 401**.

## Query parameters: before → after

| Name | Before (005 contract, observed) | After |
|---|---|---|
| `limit` | optional, default 10, "refused with 400 whenever supplied (D11); omit it". Omitting it actually returned **every** row | optional integer, **min 1, max 50, default 10**. Omitting it returns at most 10 rows |
| `offset` | optional, default 0, "refused with 400 whenever supplied (D11); omit it" | optional integer, **min 0, default 0** |
| `sort` | enum `asc`/`desc`, default `desc`. Omitting it actually gave **ascending** | enum `asc`/`desc`, default **`desc`**, now true. Ties are ordered by id |
| `old` | optional boolean. `false` actually behaved like `true` | optional, `true` or `false` only. Anything else is refused with 400 |
| `validated` | optional boolean | optional, `true` or `false` only. Anything else is refused with 400 |
| `type`, `dateFrom`, `dateTo` | unchanged | unchanged |

## Examples (after)

| Request | Status | Body |
|---|---|---|
| `/api/reservations/all` | 200 | ≤ 10 reservations, newest first |
| `?sort=asc&limit=50&offset=0` | 200 | ≤ 50 reservations, oldest first |
| `?limit=10&offset=20` (25 exist) | 200 | 5 reservations |
| `?offset=30` (25 exist) | 200 | `[]` |
| `?sort=asc&limit=200&offset=0` | 400 | `message` includes `limit must not be greater than 50` |
| `?limit=0` / `?limit=-1` / `?limit=2.5` / `?limit=abc` | 400 | `message` names `limit` |
| `?offset=-1` | 400 | `message` names `offset` |
| `?old=yes` | 400 | `message` names `old` |
| *(no token)* | 401 | unchanged |

The error body keeps the existing Nest shape `{ message: string[], error, statusCode }`.

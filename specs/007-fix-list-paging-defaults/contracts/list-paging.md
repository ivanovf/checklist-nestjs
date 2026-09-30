# Contract: paging on `GET /api/users/all`, `/api/items/all`, `/api/locks/all`

**Feature**: `specs/007-fix-list-paging-defaults` | Source of truth after merge: `openapi.json`

Access and response bodies are unchanged. The documented statuses stay **200, 400, 401** on
all three routes.

## Query parameters: before → after (all three routes)

| Name | Before (observed) | After |
|---|---|---|
| `limit` | **required** number; no range. `0` returned everything, negative values were reinterpreted, no maximum | optional integer, **1–50, default 10** |
| `offset` | **required** number; no range. `-1` was a **500** | optional integer, **≥ 0, default 0** |

Order: records come back oldest first (by id), so consecutive pages never overlap.

## Examples (after; 15 items exist)

| Request | Status | Body |
|---|---|---|
| `/api/items/all` | 200 | first 10 items |
| `?offset=10` | 200 | 5 items |
| `?limit=5` | 200 | first 5 items |
| `?limit=5&offset=5` | 200 | items 6–10 |
| `?offset=20` | 200 | `[]` |
| `?limit=50` | 200 | 15 items |
| `?limit=0`, `?limit=-5`, `?limit=2.5`, `?limit=abc`, `?limit=` | 400 | message names `limit` |
| `?limit=51`, `?limit=1000` | 400 | `limit must not be greater than 50` |
| `?offset=-1`, `?offset=abc` | 400 | message names `offset` (was **500** for `-1`) |
| *(no token)* | 401 | unchanged |

`/api/reservations/all` is unchanged by this feature. See `specs/006-fix-reservation-paging`.

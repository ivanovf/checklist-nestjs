# Contract: paging on `GET /api/activity`, `/api/activity-type`, `/api/config`

**Feature**: `specs/011-fix-unbounded-lists` | Source of truth after merge: `openapi.json`

Access and response bodies are unchanged.

| Route | Who may call | Documented statuses before → after |
|---|---|---|
| `GET /api/activity` | any signed-in account | 200, 400, 401 → **unchanged** |
| `GET /api/activity-type` | administrator | 200, 401, 403 → 200, **400**, 401, 403 |
| `GET /api/config` | any signed-in account | 200, 401 → 200, **400**, 401 |

## Query parameters: before → after (all three routes)

| Name | Before (observed) | After |
|---|---|---|
| `limit` | not accepted; any value silently ignored, whole collection returned | optional integer, **1–50, default 10** |
| `offset` | not accepted; any value silently ignored | optional integer, **≥ 0, default 0** |

The activity filters `type`, `status` and `price` are unchanged and combine with paging.

Order:
- activities: newest `date` first; activities with the same date, newest created first.
- activity types and configurations: oldest first (by id).

## Examples (after; 15 records of each kind)

| Request | Status | Body |
|---|---|---|
| `/api/activity-type` | 200 | first 10 types |
| `/api/config?offset=10` | 200 | 5 configurations |
| `/api/activity?limit=5&offset=5` | 200 | activities 6–10, newest first |
| `/api/activity?status=TODO&limit=5` | 200 | first 5 matching activities |
| `/api/activity?offset=20` | 200 | `[]` |
| `?limit=50` (any route) | 200 | 15 records |
| `?limit=0`, `?limit=-5`, `?limit=2.5`, `?limit=abc`, `?limit=`, `?limit=5&limit=7` | 400 | message names `limit` (was 200, ignored) |
| `?limit=51`, `?limit=1000` | 400 | `limit must not be greater than 50` (was 200, everything) |
| `?offset=-1`, `?offset=abc` | 400 | message names `offset` (was 200, ignored) |
| `/api/activity-type?limit=0` as a standard account | 403 | unchanged: permission is checked first |
| *(no token)* | 401 | unchanged |

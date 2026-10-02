# Data Model: Bounded Paging on the Activity, Activity Type and Configuration Lists

**Feature**: `specs/011-fix-unbounded-lists`

No stored record changes shape. What changes is the query each list accepts, the order it reads
in, and the activity indexes.

## Query: `PaginationQueryDto` (existing, unchanged)

| Field | Type | Rule | Default | Refusal (400) |
|---|---|---|---|---|
| `limit` | integer | 1 ≤ n ≤ 50 (`MAX_PAGE_SIZE`) | 10 | names `limit`; above 50: `limit must not be greater than 50` |
| `offset` | integer | n ≥ 0 | 0 | names `offset` |

Used directly by `GET /api/activity-type` and `GET /api/config`.

## Query: `FilterActivityDto` (now `extends PaginationQueryDto`)

| Field | Type | Rule | Notes |
|---|---|---|---|
| `type` | string | Mongo id, optional | unchanged |
| `status` | `COMPLETED` \| `TODO` | optional | unchanged |
| `price` | number | optional, now converted by `@Type` | unchanged behaviour, including `price=0` (research R8) |
| `limit`, `offset` | | inherited | paging applies **after** the filters (FR-006) |

## Read order

| List | Order | Tie-break | Index |
|---|---|---|---|
| activities | `date` newest first | `_id` newest first | `{ date: -1, _id: -1 }` (new) |
| activity types | `_id` oldest first | n/a (unique) | `_id` (built in) |
| configurations | `_id` oldest first | n/a (unique) | `_id` (built in) |

## `Activity` schema indexes (new)

`{ date: -1, _id: -1 }`, `{ type: 1 }`, `{ status: 1 }` and `{ price: 1 }`: every field the
list sorts or filters on (Principle V; research R5).

## Response

Unchanged: a plain JSON array of the same record shapes. Activities still carry their populated
`type`. There is no envelope, total count or next-page link.

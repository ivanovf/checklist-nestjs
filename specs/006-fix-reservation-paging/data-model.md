# Data Model: Usable Paging on the Reservation List

**Feature**: `specs/006-fix-reservation-paging` | **Date**: 2026-09-29

No stored data changes shape. This feature changes the **list query** (a request DTO), the
**order** in which reservations are read, and adds one **index**.

## Reservation list query (`FilterReservationsDto`, extends `FilterListDto`)

What the handler receives after the route-scoped conversion (research R2). All fields are
optional.

| Field | Type after conversion | Default | Rule | Refusal (400) when |
|---|---|---|---|---|
| `limit` | integer | **10** | 1 ≤ limit ≤ **50** | not an integer, < 1, > 50, repeated |
| `offset` | integer | **0** | offset ≥ 0 | not an integer, < 0, repeated |
| `sort` | `'asc'` \| `'desc'` | **`'desc'`** | one of the two | any other value (unchanged) |
| `type` | `'airbnb'` \| `'booking'` \| `'direct'` | none | one of the three | any other value (unchanged) |
| `old` | boolean | none | `'true'` → true, `'false'` → false | **any other value (new)** |
| `validated` | boolean | none | `'true'` → true, `'false'` → false | **any other value (new)** |
| `dateFrom` | ISO date string | none | ISO 8601 | not a date string (unchanged) |
| `dateTo` | ISO date string | none | ISO 8601 | not a date string (unchanged) |

`FilterListDto` is used only by `FilterReservationsDto`, so changing it affects no other
route. `PaginationQueryDto`, which the items, locks and users lists use, is **not** touched.

## Read order

`{ dateIni: sortDir, _id: sortDir }`, where `sortDir` is −1 for `desc` (the default) and 1
for `asc`. `_id` makes the order total, so `skip`/`limit` pages never overlap and never
leave gaps (research R5).

## Index (`ReservationSchema`)

| Index | Serves | Why |
|---|---|---|
| `{ dateIni: -1, _id: -1 }` | the list sort in both directions, and `dateFrom` | Principle V; ships with the sort change (R6) |
| `{ type: 1 }` | `type` filter | Principle V (analysis C1) |
| `{ validated: 1 }` | `validated` filter | Principle V (analysis C1) |
| `{ dateEnd: 1 }` | `old` and `dateTo` filters | Principle V (analysis C1) |

## Response

Unchanged: a JSON array of `ReservationResponseDto`, at most `limit` long.

# Data Model: Refuse Unknown Fields in Requests

No collection, schema path or index changes, and no data migration.

## Reservation lock (`userLock`), request rules changed

| Aspect | Before | After |
|---|---|---|
| Schema path | `userLock` (optional string) | unchanged |
| Request field | undeclared, accepted and stored unchecked; the declared `lockUser` is dropped | **declared** `userLock`, optional; `lockUser` removed (now refused) |
| Accepted values | anything | a lock user slot (same rule as a lock code's `userNumber`: `IsDigitalNumber(20)`), a well-formed lock code id (older reservations), or empty (`''`/`null`) |
| Empty value | stored as sent | removes the lock (`$unset`), so reads show no `userLock` |
| Omitted on a change | keeps the stored value | unchanged |
| Answer | `userLock` returned, but undocumented | returned and documented |

Stored values are never rewritten. An older id-valued `userLock` reads as before, and the same
value sent back on an edit is accepted.

## Checklist item inside a reservation (`ReservationItemDto`, new request type)

`CreateItemDto` fields plus an optional `_id` (a well-formed id), stored as the embedded item's
id as today. `POST/PUT /api/items` keep `CreateItemDto`/`UpdateItemDto`, without `_id`.

## Declared request fields

| Operation | Body | Nested |
|---|---|---|
| `POST /api/items` · `PUT /api/items/:id` | `CreateItemDto` · `UpdateItemDto` | — |
| `POST /api/locks` · `PUT /api/locks/:id` | `CreateLockDto` · `UpdateLockDto` | — |
| `POST /api/users` · `PUT /api/users/:id` | `CreateUserDto` · `UpdateUserDto` | — |
| `POST /api/reservations` · `PUT /api/reservations/:id` | `CreateReservationDto` · `UpdateReservationDto` | `items[]` → `ReservationItemDto` |
| `POST /api/config` · `PUT /api/config/:id` | `CreateConfigDto` · `UpdateConfigDto` | — |
| `PATCH /api/config/:id` (device) | `TankLevelConfigDto` | — |
| `POST /api/activity` · `PUT /api/activity/:id` | `CreateActivityDto` · `UpdateActivityDto` | — |
| `POST /api/activity-type` · `PUT /api/activity-type/:id` | `CreateActivityTypeDto` · `UpdateActivityTypeDto` | — |

| List | Declared query parameters |
|---|---|
| `GET /api/items/all`, `/api/locks/all`, `/api/users/all` | `limit`, `offset` (`PaginationQueryDto`) |
| `GET /api/reservations/all` | `limit`, `offset`, `sort`, `type`, `old`, `validated`, `dateFrom`, `dateTo` |
| `GET /api/activity` | `type`, `status`, `price` |
| `GET /api/config`, `GET /api/activity-type` | none; the query isn't read and stays ignored |

## API-owned fields

| Field | Create (POST) | Change (PUT, device PATCH) |
|---|---|---|
| `_id` | refused (undeclared) | accepted and ignored if it equals the path id; otherwise 400 `_id must match the id in the path` |
| `createdAt`, `updatedAt`, `__v` | refused | refused |

## Order of refusals (observed in the spike)

```text
401 no credentials → 403 role → 400 body _id ≠ path id (interceptor)
  → 400 malformed path id (ParseObjectIdPipe) → 400 invalid body/query, incl. undeclared → 404 unknown id
```

A malformed path id together with an undeclared body field answers with the path-id message
(`Invalid id "abc"`). Both are 400.

Messages: `property <name> should not exist`; nested: `items.0.property y should not exist`.
Both come in the standard error body (`statusCode`, `error`, `message[]`).

# Contract Changes: Request Rules and the Reservation Lock

Changes to the committed `openapi.json`, regenerated with `pnpm docs:export` in the same PR.

## 1. Closed request schemas

`additionalProperties: false` is added to every schema reached from a validated `requestBody`:

`CreateItemDto`, `UpdateItemDto`, `CreateLockDto`, `UpdateLockDto`, `CreateUserDto`,
`UpdateUserDto`, `CreateReservationDto`, `UpdateReservationDto`, `ReservationItemDto` (new,
nested), `CreateConfigDto`, `UpdateConfigDto`, `TankLevelConfigDto`, `CreateActivityDto`,
`UpdateActivityDto`, `CreateActivityTypeDto` and `UpdateActivityTypeDto`: 16 schemas.

`LoginRequestDto` stays open. Response schemas aren't touched.

## 2. `_id` on change bodies

These schemas gain an optional `_id: string`, described as "May repeat the id in the path; any
other value is refused":
- `Update*Dto` for items, locks, users, reservations, config, activity and activity-type;
- `TankLevelConfigDto`.

They are used only by change operations. Create schemas don't get it.

## 3. Reservation lock

| Where | Before | After |
|---|---|---|
| `CreateReservationDto` / `UpdateReservationDto` | optional `lockUser` ("Accepted but currently not stored (discrepancy D15)") | `lockUser` removed. Optional `userLock`: "The assigned lock: a lock code's user slot (e.g. `03`), or a lock code's id for older reservations. Empty removes the lock." |
| `CreateReservationDto.items` | `CreateItemDto[]` | `ReservationItemDto[]` (`CreateItemDto` + optional `_id`) |
| `ReservationResponseDto` | no lock field | optional `userLock: string` (returned today, now documented) |

## 4. Refusals

No `@ApiRefusals` changes. 400 is already documented on all 15 body operations and on the 7
lists with declared query parameters.

## 5. Behaviour behind the contract

| Request | Before | After |
|---|---|---|
| any of the 15 with an undeclared body field (any depth) | 200/201, dropped or stored | **400** `property <name> should not exist` |
| any create with `_id` | 201, caller's id **stored** | **400** |
| any change with `_id` = path id (the mobile app) | 200 | 200 (unchanged) |
| any change with `_id` ≠ path id | 200 (Mongo error or no-op, untested) | **400** `_id must match the id in the path` |
| any of the 15 with `createdAt` / `updatedAt` / `__v` | dates **stored** | **400** |
| reservation with items carrying `_id` | stored | stored (unchanged) |
| reservation with `userLock: "03"` | stored, unchecked | stored (unchanged) |
| reservation with `userLock: "ul"` | stored | **400** |
| reservation `PUT` with `userLock: ""` | stored as `""` | lock removed |
| reservation with `lockUser` | 201, dropped | **400** (undeclared) |
| any of the 7 lists (`/api/{items,locks,users}/all`, `/api/reservations/all`, `/api/activity`, `/api/activity-type`, `/api/config`) with `?foo=1` | 200 | **400** `property foo should not exist` |
| `POST /api/login` with an extra field | 201 | 201 (out of scope) |
| any request with only declared fields and parameters | as today | as today |

## 6. Discrepancy register

- **D5** resolved by `specs/010-fix-unknown-fields`. Evidence:
  `test/records/unknown-fields.e2e-spec.ts`.
- **D15** resolved: `lockUser` removed and `userLock` declared. Evidence:
  `test/reservations/reservation-lock.e2e-spec.ts`.

Both pins are removed from `test/docs/contract-discrepancies.e2e-spec.ts`.

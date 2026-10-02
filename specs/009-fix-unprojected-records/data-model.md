# Data Model: Published Record Shapes

**Feature**: `specs/009-fix-unprojected-records`

No stored schema changes. This feature defines what may leave the service. Each shape is the
existing `*-response.dto.ts` class with `__v` removed, and it becomes a real projection target
(research R2).

`?` = sent only when the record holds a value. All `_id` values are strings, and dates are ISO
strings on the wire (unchanged).

| Shape (DTO) | Fields | Used by |
|---|---|---|
| `UserResponseDto` | `_id, email, name, role, createdAt, updatedAt` | users: POST, GET all, GET :id, PUT :id |
| `ItemResponseDto` | `_id, label, status, checked, description?, comments, category, createdAt, updatedAt` | items: POST, GET all, GET :id, PUT :id |
| `ReservationResponseDto` | `_id, dateIni, dateEnd, type, validated, contact, quantity, cost?, items: ReservationItemResponseDto[], createdAt, updatedAt` | reservations: POST, GET all, GET :id, PUT :id |
| `ReservationItemResponseDto` (nested) | `_id, label, status, checked, description?, comments, category, createdAt, updatedAt` (unchanged, never had `__v`) | inside reservations |
| `LockResponseDto` | `_id, lock, userNumber, createdAt, updatedAt` | locks: POST, GET all, GET :id, PUT :id |
| `ConfigResponseDto` | `_id, doorLock, mainLock, usersLimit, analogLecture, createdAt, updatedAt` | config: POST, GET, PUT :id, PATCH :id |
| `ActivityTypeResponseDto` | `_id, name, budget, description?, createdAt, updatedAt` | activity-type: POST, GET, GET :id, PUT :id, DELETE :id; nested in activity reads |
| `ActivityResponseDto` | `_id, type: ActivityTypeResponseDto \| null, status, price, date, description?, createdAt, updatedAt` | activity: GET, GET :id |
| `ActivityRecordResponseDto` | `_id, type: string, status, price, date, description?, createdAt, updatedAt` | activity: POST, PUT :id |

Field lists were checked against each DTO file on 2026-10-01. Each matches, apart from `__v`. The
compiler enforces that each projection matches its DTO exactly.

`ActivityResponseDto.type` is declared non-null today, but the API answers `null` once the activity
type is deleted (observed, research R4). The DTO and contract mark it nullable. This documents
existing behaviour and doesn't change it.

## Never sent

| Field | Why |
|---|---|
| `__v` | store-internal revision counter (FR-002) |
| `password` | secret, sent on no path, whatever the source document holds (FR-005) |
| any stored field not listed above | allowlist (FR-006) |

## Account password (D17)

| State | Stored `password` |
|---|---|
| Valid | bcrypt hash matching `^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$` |
| Defective (D17) | anything else: plain text written by an earlier account change |

Transitions:
- Create, or change with `changePassword: true` → valid (the hash of the new value).
- Change with `changePassword: false` → **unchanged** (it was "defective := sent text").
- Repair `--apply` → defective becomes valid, as the hash of the same text. Valid stays valid,
  untouched.

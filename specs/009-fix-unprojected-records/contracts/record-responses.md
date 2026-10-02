# Contract Changes: Record Responses, Account Change, Password Repair

**Feature**: `specs/009-fix-unprojected-records`. The source of truth is `openapi.json`,
regenerated with `pnpm docs:export` in the same PR.

## 1. Response bodies (29 operations)

No route, status, parameter or request body changes. Only response schemas change:

| Schema | Change |
|---|---|
| `UserResponseDto`, `ItemResponseDto`, `ReservationResponseDto`, `LockResponseDto`, `ConfigResponseDto`, `ActivityTypeResponseDto`, `ActivityResponseDto`, `ActivityRecordResponseDto` | `__v` removed from `properties` and `required` |
| `ActivityResponseDto.type` | becomes nullable (`ActivityTypeResponseDto` or `null`), documenting the observed answer for a deleted activity type |
| `ReservationItemResponseDto`, `DeletedResponseDto`, `ActivityDeletedResponseDto`, `LoginResponseDto`, `TokenValidationResponseDto`, `AppInfoResponseDto` | unchanged |

Each DTO's doc comment changes from "Documentation only … internal fields included (discrepancy
D3). Nothing constructs it" to say that it is the projection target and is what the service
returns.

**Conformance rule** (tested for all 29 operations): every key of a response body, and of each
nested record, is a property of its schema. Every `required` property is present. `__v` and
`password` appear at no depth.

## 2. `PUT /api/users/:id` (D17)

Request schema unchanged (`UpdateUserDto`: every field still required, D9 / #14). Statuses
unchanged (200, 400, 401, 403, 404, 406). Behaviour change, documented in the operation
description:

| `changePassword` | Effect on the stored password |
|---|---|
| `false` | unchanged. `password` and `currentPassword` are accepted and ignored |
| `true` | replaced by the hash of `password`, after `currentPassword` is verified (406 if wrong, as today) |

## 3. Repair command (not an HTTP route)

```text
NODE_ENV=<env> pnpm db:repair-passwords            # dry run: report only
NODE_ENV=<env> pnpm db:repair-passwords --apply    # hash plain-text passwords in place
```

- `NODE_ENV` is required: the runner refuses to start without it, so the env file
  (`.env.<env>`), and so the database, is always named explicitly.
- Output, in both modes: the target database name, accounts scanned, accounts with a plain-text
  password, and for each one its `<id>`, plus accounts with no password (skipped). It never
  prints a password, a hash or an email.
- Exit code 0 when nothing is left to repair (after `--apply`, or a clean dry run). Exit code 1 when
  a dry run found accounts to repair. Exit code 2 on failure.
- Repeatable: a second `--apply` reports 0 repaired.

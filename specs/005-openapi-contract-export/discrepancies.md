# Discrepancy Register: Accurate, Exported API Contract

**Feature**: `specs/005-openapi-contract-export` | Serves FR-011, SC-006

Each entry is a place where real behaviour differs from what the code appears to intend,
or from the constitution. The contract documents the **observed** behaviour (FR-006). The
behaviour itself is not changed here (FR-012). Each entry is proven by a test in
`test/docs/contract-discrepancies.e2e-spec.ts` and tracked by a GitHub issue.

When a later feature fixes an entry, its proving test fails. That feature then updates
the contract, this entry, and the test together.

| Field | Meaning |
|---|---|
| Observed | status and body seen when running it, with the date |
| Apparent intent | what the code or the constitution suggests should happen |
| Evidence | the proving test in `test/docs/` |
| Principle | constitution principle it deviates from, if any |
| Issue | GitHub issue tracking the fix |

---

## D1 — Paging values are required despite defaults

- **Operation(s)**: `GET /api/users/all`, `GET /api/items/all`, `GET /api/locks/all`
- **Observed** (2026-09-28, all three routes): omitting `limit` or `offset` returns **400**.
  Pinned by `test/docs/pagination-query.e2e-spec.ts`, which stays green after the D4 fix
- **Apparent intent**: optional values defaulting to 10 and 0. `ParseIntPipe` rejects
  `undefined` before the parameter default applies
- **Evidence**: `test/docs/pagination-query.e2e-spec.ts` (regression suite; the D1 case was
  removed from `contract-discrepancies.e2e-spec.ts`)
- **Principle**: V (lists paginated with a bounded default and a hard maximum)
- **Also found** (observed 2026-09-29): the values had no range. `limit=0` returned every
  record, a negative `limit` was reinterpreted by the database (`-5` returned 5), there was no
  maximum, and `offset=-1` was a **500**. All are fixed by the same change.
- **Issue**: #7
- **Status**: Resolved by `specs/007-fix-list-paging-defaults` (2026-09-30). Paging is
  optional (`limit` 1–50 with default 10, `offset` ≥ 0 with default 0), anything else is refused
  with 400, and the lists read in a fixed order by id. All four paged lists now share
  `PaginationQueryDto`.

## D2 — An unknown id is answered as success

- **Operation(s)** and observed outcome for a well-formed id that matches no record
  (2026-09-28):
  - `GET` and `PUT` on `/api/items/:id`, `/api/locks/:id`, `/api/reservations/:id` and
    `/api/activity-type/:id`: **200, empty body**
  - `PUT /api/config/:id` and `PATCH /api/config/:id`: **200, empty body**
  - `PUT /api/activity/:id`: **200, empty body**
  - `DELETE` on `/api/items/:id`, `/api/locks/:id` and `/api/reservations/:id`:
    **200 `{deleted}`**. `DELETE /api/activity-type/:id`: **200, empty body**
  - For contrast, `/api/users/:id` (GET, DELETE) and `/api/activity/:id` (GET, DELETE)
    return **404**
- **Apparent intent**: 404 Not Found, which several services write as `if (!doc) throw`
  against an unawaited query, a check that can never fire
- **Evidence**: `test/records/record-ids.e2e-spec.ts` (all 20 by-id operations; the D2 cases
  were removed from `contract-discrepancies.e2e-spec.ts`)
- **Principle**: IV (errors as Nest HTTP exceptions with a consistent shape)
- **Also found** (observed 2026-09-30): with a malformed id, the item, lock and reservation
  DELETEs also answered `{ deleted: true }`, because their unawaited query's rejection went
  unhandled. `activity-type` (all three) and `PUT /api/activity/:id` had no existence check at
  all.
- **Issue**: #8
- **Status**: Resolved by `specs/008-fix-unknown-id-404` (2026-09-30). Every by-id operation
  awaits its query and answers **404** `<kind> #<id> not found` for an unknown id, and a delete
  reports only a real deletion.

## D3 — Stored records are returned unprojected

- **Operation(s)**: every route returning a stored record
- **Observed** (2026-09-28): `GET /api/users/all` items carry
  `_id, email, name, role, createdAt, updatedAt, __v`. No password, but internal fields
  such as `__v` are exposed
- **Apparent intent**: responses projected through a DTO or serializer
- **Evidence**: `test/records/record-fields.e2e-spec.ts` (all 29 record-returning operations; the
  D3 case was removed from `contract-discrepancies.e2e-spec.ts`)
- **Principle**: II ("Mongoose documents MUST NOT be returned raw from controllers")
- **Also found** (observed 2026-10-01): every one of the 29 operations sent `__v`, including the
  activity type populated inside an activity, and nothing limited an answer to its published
  fields. The hash stayed out only because the schema hides it by default. An activity whose type
  was deleted is answered with `type: null`, which the contract described as never null.
- **Issue**: #9
- **Status**: Resolved by `specs/009-fix-unprojected-records` (2026-10-01). Every record answer is
  projected through its response DTO from a compiler-checked allowlist, so `__v` is gone and a
  field added to storage stays out until it is published. `ActivityResponseDto.type` is now
  documented as nullable.

## D4 — Query values are bound without a typed input shape

- **Operation(s)**: list routes using `@Query('<name>', ParseIntPipe)`
- **Observed** (2026-09-28): `limit` and `offset` are bound one by one, with no
  `class-validator` DTO
- **Apparent intent**: a typed, validated query DTO
- **Evidence**: `test/docs/pagination-query.e2e-spec.ts` (T038)
- **Principle**: IV ("Untyped `@Body()` or `@Query()` is prohibited")
- **Issue**: none, fixed in this feature
- **Resolution** (clarified 2026-09-28): **fixed in this feature** (T038). A typed
  `PaginationQueryDto` keeps both values required, so every status is unchanged (proved
  by the T038 regression tests). No GitHub issue is opened for D4. The proving test in
  check 7 is replaced by T038's tests.

## D5 — The global validation pipe does not reject unknown fields

- **Operation(s)**: every route with a request body
- **Observed** (2026-09-28, read from `src/bootstrap.ts`): `ValidationPipe` is created
  with `transformOptions` only; `whitelist` and `forbidNonWhitelisted` are not set.
  Observed 2026-09-28: `POST` with an extra unknown field returns **201** on items, locks,
  users, activity-type and activity
- **Apparent intent**: unknown fields rejected
- **Evidence**: `test/docs/contract-discrepancies.e2e-spec.ts` › "D5: …"
- **Principle**: IV ("MUST run with `whitelist: true` and `forbidNonWhitelisted: true`")
- **Issue**: #10
- **Status**: Resolved by `specs/010-fix-unknown-fields` (2026-10-01). Every body and every
  list query refuses an undeclared field or parameter with **400** `property <name> should not
  exist`, at any depth, and passes declared values on unchanged. `_id`, `createdAt`,
  `updatedAt` and `__v` are refused, except that a change may repeat its record's own `_id`
  (the mobile app sends it). Pinned by `test/records/unknown-fields.e2e-spec.ts`.

## D6 — Some list routes are unbounded

- **Operation(s)**: `GET /api/activity`, `GET /api/config`, `GET /api/activity-type`
- **Observed** (2026-09-28): read from the services, `find()` with no `limit`, so the
  whole collection is returned. None of the three accepts a paging parameter
- **Apparent intent**: paginated, with a bounded default and a hard maximum
- **Evidence**: `test/docs/pagination-query.e2e-spec.ts` (activity types and configurations)
  and `test/activity/activity-paging.e2e-spec.ts` (activities). The D6 case was removed from
  `contract-discrepancies.e2e-spec.ts`
- **Principle**: V ("Every list endpoint MUST be paginated … Unbounded `find()` … is
  prohibited")
- **Also found** (observed 2026-10-01): paging values were silently ignored rather than
  refused (`limit=5`, `limit=0`, `limit=abc` and `offset=-1` all answered 200 with every
  record), and activities sharing a date came back in no fixed order. The activity list
  sorted and filtered on fields with no index. All are fixed by the same change.
- **Issue**: #11
- **Status**: Resolved by `specs/011-fix-unbounded-lists` (2026-10-01). All three lists page like
  the others (`limit` 1–50 with default 10, `offset` ≥ 0 with default 0, anything else refused
  with 400). Activities read newest first with the id as a tie-break; activity types and
  configurations read oldest first.

## D7 — A malformed id is a server error

- **Operation(s)**: every by-id operation, all 20 (corrected 2026-09-30: not only `GET`). 17
  answered **500**, and the item, lock and reservation DELETEs answered `{ deleted: true }`
- **Observed** (2026-09-28): `GET /api/<module>/not-an-id` returns **500**
  `Internal server error`. The Mongoose cast error is not mapped to a client error
- **Apparent intent**: 400 (invalid identifier) or 404
- **Contract**: 500 is not documented. It is a defect, not a response the API offers
  (check 4)
- **Evidence**: `test/records/record-ids.e2e-spec.ts` (the D7 case was removed from
  `contract-discrepancies.e2e-spec.ts`)
- **Principle**: IV ("Raw driver, Mongoose … details MUST NOT reach clients"; errors as
  consistent HTTP exceptions)
- **Issue**: #12
- **Status**: Resolved by `specs/008-fix-unknown-id-404` (2026-09-30). `ParseObjectIdPipe` on
  every `:id` answers **400** `Invalid id "<value>"`, after the guards, so 401 and 403 still come
  first.

## D8 — Some invalid update bodies are server errors

- **Operation(s)**: recorded as `PUT /api/items/:id` and `PUT /api/reservations/:id`.
  Corrected 2026-10-02: every operation with a validated body (16), on create **and** change,
  including the checklist entries inside a reservation. Locks were the only kind without a
  server error, but they accepted numbers as codes
- **Observed** (2026-09-28): a body whose fields have the wrong type returns **500**,
  where locks, activity-type and activity return 400 for the same kind of body
- **Apparent intent**: 400 from validation
- **Contract**: documents 400 (which valid-typed invalid input does produce), not 500
- **Evidence**: `test/records/field-types.e2e-spec.ts` (the D8 case was removed from
  `contract-discrepancies.e2e-spec.ts`)
- **Principle**: IV
- **Also found** (observed 2026-10-02, during specs/014-fix-mistyped-fields):
  - The cause was the same on every route. A body was checked after implicit conversion and
    stored as it was sent, so the value checked was not the value stored. 49 field-and-value
    combinations answered 500: an object for text, text or a number for a yes/no, `true` for a
    date, and anything but a number for a reservation `cost`, which had no type check.
  - The 2026-09-28 claim that activity types and activities answer 400 was wrong. Both
    answered 500 for an object in a text field.
  - Other wrongly typed values were accepted and stored converted: a number or yes/no as text
    (`label: 7` stored `"7"`, lock codes included), `true` as `1`, a number as a date in 1970,
    an impossible date such as 30 February (it passed the check, which reads it as a day in
    March; derived, not run on the API), text `"false"` as `false`, and
    `changePassword: "abc"` read as yes.
  - A change could store `null` in a field that create requires, such as an item's label or
    a reservation's dates.
- **Issue**: #13
- **Status**: Resolved by `specs/014-fix-mistyped-fields` (2026-10-02). Bodies are checked as
  sent, never converted, so every wrongly typed field is refused with **400** naming it. Dates
  are ISO 8601 text that is a real date, `cost` is a number, and lock codes are text. A change
  refuses `null` for every field a create refuses it for; optional fields can still be
  cleared. The contract was unchanged: it already declared every field's kind and 400.

## D9 — Updating a user requires every field

- **Operation(s)**: `PUT /api/users/:id`
- **Observed** (2026-09-28): a partial body (`{name}`) returns **400** listing every field
  of `CreateUserDto` plus `changePassword` and `currentPassword`. A full body returns 200.
  `UpdateUserDto` is an intersection of the create and password DTOs, not a partial type
- **Apparent intent**: a partial update, like every other module's `Update*Dto`
- **Contract**: documents the body as it is, with all fields required
- **Evidence**: `test/docs/contract-discrepancies.e2e-spec.ts` › "D9: …"
- **Principle**: —
- **Issue**: #14

## D10 — The device route refuses a wrong key with 404, and also needs a sign-in

- **Operation(s)**: `PATCH /api/config/:id`
- **Observed** (2026-09-28): no bearer token → **401**; token plus a wrong `apiKey` in the
  body → **404** `Invalid API Key`; token plus the right key → 200. The key is a body
  field, checked in the service; the route also needs a signed-in account because it is
  not public. The key is **not** persisted or returned (checked: absent from
  `GET /api/config` and from the PATCH response)
- **Apparent intent**: a device-key route. A wrong key should be 401 or 403
- **Contract**: documents bearer auth, the `apiKey` body field, and 400, 401, 404
- **Evidence**: `test/docs/contract-discrepancies.e2e-spec.ts` › "D10: …"
- **Principle**: III (explicit, centrally enforced controls: the key check lives in a
  service, not a guard)
- **Issue**: #15

## D11 — Paging on the reservation list is unusable

- **Operation(s)**: `GET /api/reservations/all`
- **Observed** (2026-09-28): any `limit` or `offset`, even `offset=0`, returns **400**
  (`must be a number conforming to the specified constraints`). The query strings are
  never converted to numbers for `FilterListDto`. Without them, the route answers 200
- **Apparent intent**: optional paging with defaults 10 and 0
- **Contract**: documents `limit` and `offset` as optional, with a description saying that
  supplying either is currently refused
- **Evidence**: `test/reservations/reservation-paging.e2e-spec.ts` (regression suite; the
  D11 case was removed from `contract-discrepancies.e2e-spec.ts`)
- **Principle**: V (lists paginated with a bounded default). Correction, observed 2026-09-29:
  the default did **not** apply. Without paging values the route returned every
  reservation, because the handler received the raw query rather than the defaulted DTO.
- **Also found**: the same root cause made the default order ascending although the contract
  said `desc`, and made `old=false` filter like `old=true`. Both are fixed by the same change.
- **Issue**: #16
- **Status**: Resolved by `specs/006-fix-reservation-paging` (2026-09-29): paging is
  optional (1–50, default 10, offset default 0), larger pages are refused, the order is
  newest first with a stable tie-break, and flags accept only `true` or `false`.

## D12 — An invalid role is a server error

- **Operation(s)**: `POST /api/users`
- **Observed** (2026-09-28): `role: "superuser"` returns **500**. `CreateUserDto.role` is
  validated only as a string; the schema enum rejects it at save time
- **Apparent intent**: 400
- **Evidence**: `test/docs/contract-discrepancies.e2e-spec.ts` › "D12: …"
- **Principle**: IV
- **Issue**: #17

## D13 — Duplicate email addresses are accepted ⚠️ security

- **Operation(s)**: `POST /api/users`
- **Observed** (2026-09-28): creating a second account with an existing email returns
  **201**. Sign-in resolves the first match, so the second account can never sign in,
  and which account an email "is" depends on insertion order
- **Apparent intent**: one account per email (409 or 400 on a duplicate)
- **Evidence**: `test/docs/contract-discrepancies.e2e-spec.ts` › "D13: …"
- **Principle**: III
- **Issue**: #18

## D14 — Dead device guard with a hardcoded credential ⚠️ security

- **Operation(s)**: none. `ApiKeyGuard` (`src/auth/guards/api-key.guard.ts`) is applied to
  no route
- **Observed** (2026-09-28, read): it compares the `Auth` header with a string literal
  written in the source, and its spec asserts that literal. `TANK_API_KEY` is not used
- **Apparent intent**: a device guard using `TANK_API_KEY`, which D10's route should use
- **Contract**: nothing to document, because no route uses it
- **Evidence**: source reading. It is dead code, so there is no behaviour to execute
- **Principle**: III ("Hardcoded credentials are a blocking defect, not a cleanup item")
- **Issue**: #19


## D15 — A reservation's lock user is accepted and discarded

- **Operation(s)**: `POST /api/reservations`, `PUT /api/reservations/:id`
- **Observed** (2026-09-28): `lockUser: "5"` is validated and accepted (201), but it is
  neither returned nor stored. The schema's field is named `userLock`, so the value is
  dropped
- **Apparent intent**: the reservation records which lock user code it was given
- **Contract**: documents `lockUser` as an accepted optional request field, and no lock
  user field in the response, because none is ever returned
- **Evidence**: `test/docs/contract-discrepancies.e2e-spec.ts` › "D15: …"
- **Principle**: —
- **Issue**: #20
- **Status**: Resolved by `specs/010-fix-unknown-fields` (2026-10-01). The mobile app always
  recorded the lock as `userLock` (a lock code's user slot, or a lock code's id in older
  reservations), so `userLock` is now the declared field, stored and answered, and an empty
  value removes the lock. The unused `lockUser` is refused. Pinned by
  `test/reservations/reservation-lock.e2e-spec.ts`.

## D16 — An account password change can be refused with an undocumented 406

- **Operation(s)**: `PUT /api/users/:id`
- **Observed** (read in `UsersService.update`, 2026-09-30, during feature 008): a wrong
  current password (`The password does not match.`) or a missing new one
  (`No new password provide`) is refused with **406 Not Acceptable**
- **Apparent intent**: a client error the contract describes, most likely 400 or 403
- **Contract**: does not document 406, and `test/docs` check 4 would not allow it, so the
  contract is silent about these refusals
- **Evidence**: none yet. Recorded only; the behaviour is unchanged by 008
- **Principle**: IV (documented response statuses, including error cases)
- **Issue**: none yet. Open one only with the owner's approval

## D17 — An account change stores the sent password as plain text ⚠️ security

- **Operation(s)**: `PUT /api/users/:id`
- **Observed** (2026-10-01, run during specs/009-fix-unprojected-records): every field is required
  (D9), `password` included. With `changePassword: false` that value was still written, as plain
  text, over the stored hash (`"password":"sent-pw"` in the raw record). Sign-in then refused
  both the previous password and the value sent (401), so the account was locked out. A verified
  change (`changePassword: true`) stored a hash correctly
- **Apparent intent**: a change without a password change leaves the password alone, and a
  password is only ever stored as a bcrypt hash
- **Evidence**: `test/records/account-password.e2e-spec.ts`, `src/users/users.service.spec.ts`
  › "update writes", and the repair in `test/records/password-repair.e2e-spec.ts`
- **Principle**: III ("Passwords MUST be stored only as bcrypt hashes")
- **Issue**: #28
- **Status**: Resolved by `specs/009-fix-unprojected-records` (2026-10-01). The change writes only
  `email`, `name` and `role`, plus the hash of a verified new password. Accounts already holding
  plain text are repaired by `NODE_ENV=<env> pnpm db:repair-passwords` (a dry run by default,
  then `--apply`), which hashes each value in place. Running it on production is the owner's step.

## D18 — A lock code accepts text that only starts with digits

- **Operation(s)**: `POST /api/locks`, `PUT /api/locks/:id`; a reservation's `userLock` reuses
  the same rule for its user slot
- **Observed** (2026-10-02, run on `IsDigitalNumberConstraint` during
  specs/014-fix-mistyped-fields): `"12ab"`, `" 7"`, `"0x10"` and `"1e3"` are accepted, because
  the rule reads the value with `parseInt` and checks only the leading number
- **Apparent intent**: a lock code and a user slot made of digits only
- **Evidence**: none yet. Recorded only
- **Principle**: IV (validated input at the boundary)
- **Issue**: none yet. Open one only with the owner's approval

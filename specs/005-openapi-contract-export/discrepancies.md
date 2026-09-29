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
- **Evidence**: `test/docs/contract-discrepancies.e2e-spec.ts` › "D1: …", and every list route in `test/docs/pagination-query.e2e-spec.ts`
- **Principle**: —
- **Issue**: #7

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
- **Evidence**: `test/docs/contract-discrepancies.e2e-spec.ts` › both "D2: …" tests (unknown item: GET 200 empty, DELETE 200 `{deleted: true}`)
- **Principle**: IV (errors as Nest HTTP exceptions with a consistent shape)
- **Issue**: #8

## D3 — Stored records are returned unprojected

- **Operation(s)**: every route returning a stored record
- **Observed** (2026-09-28): `GET /api/users/all` items carry
  `_id, email, name, role, createdAt, updatedAt, __v`. No password, but internal fields
  such as `__v` are exposed
- **Apparent intent**: responses projected through a DTO or serializer
- **Evidence**: `test/docs/contract-discrepancies.e2e-spec.ts` › "D3: …"
- **Principle**: II ("Mongoose documents MUST NOT be returned raw from controllers")
- **Issue**: #9

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

## D6 — Some list routes are unbounded

- **Operation(s)**: `GET /api/activity`, `GET /api/config`, `GET /api/activity-type`
- **Observed** (2026-09-28): read from the services, `find()` with no `limit`, so the
  whole collection is returned. None of the three accepts a paging parameter
- **Apparent intent**: paginated, with a bounded default and a hard maximum
- **Evidence**: `test/docs/contract-discrepancies.e2e-spec.ts` › "D6: …"
- **Principle**: V ("Every list endpoint MUST be paginated … Unbounded `find()` … is
  prohibited")
- **Issue**: #11

## D7 — A malformed id is a server error

- **Operation(s)**: `GET` on every `/:id` route (items, locks, users, reservations,
  activity-type, activity)
- **Observed** (2026-09-28): `GET /api/<module>/not-an-id` returns **500**
  `Internal server error`. The Mongoose cast error is not mapped to a client error
- **Apparent intent**: 400 (invalid identifier) or 404
- **Contract**: 500 is not documented. It is a defect, not a response the API offers
  (check 4)
- **Evidence**: `test/docs/contract-discrepancies.e2e-spec.ts` › "D7: …"
- **Principle**: IV ("Raw driver, Mongoose … details MUST NOT reach clients"; errors as
  consistent HTTP exceptions)
- **Issue**: #12

## D8 — Some invalid update bodies are server errors

- **Operation(s)**: `PUT /api/items/:id`, `PUT /api/reservations/:id`
- **Observed** (2026-09-28): a body whose fields have the wrong type returns **500**,
  where locks, activity-type and activity return 400 for the same kind of body
- **Apparent intent**: 400 from validation
- **Contract**: documents 400 (which valid-typed invalid input does produce), not 500
- **Evidence**: `test/docs/contract-discrepancies.e2e-spec.ts` › "D8: …"
- **Principle**: IV
- **Issue**: #13

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
- **Evidence**: `test/docs/contract-discrepancies.e2e-spec.ts` › "D11: …"
- **Principle**: V (lists paginated with a bounded default): the default still applies,
  but callers cannot page
- **Issue**: #16

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

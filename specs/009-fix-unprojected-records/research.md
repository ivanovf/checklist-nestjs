# Research: Stored Records Answered Only With Their Published Fields

**Feature**: `specs/009-fix-unprojected-records` | **Date**: 2026-10-01

Each finding below was checked by running the code (CLAUDE.md: verify behaviour by running it),
using throwaway e2e probes and a `ts-node` script that were deleted afterwards.

## R1 — How answers are built today

**Observed**: services return Mongoose documents (or `skipPassword(user)`, which is `toJSON()`
minus `password`), and Express serialises them as they are. The `*-response.dto.ts` classes are
documentation-only: "Nothing constructs it". All 29 record-returning operations send `__v`. Nested
reservation items carry `_id, label, status, checked, description, comments, category, createdAt,
updatedAt` (no `__v`). A populated activity type carries `__v`.

**Consequence**: the DTO classes already describe the published shape, through the Swagger CLI
plugin in `nest-cli.json`. Removing `__v` from them and actually building them fixes both the
contract and the answers.

## R2 — Projection mechanism

**Decision**: explicit projection functions, one per published shape, that copy only the named
fields from the document into a new plain object typed as the response DTO. Each function's field
list is a `satisfies Record<keyof XResponseDto, true>` object (or equivalent), so the compiler
refuses a field the DTO doesn't declare and a DTO field the list leaves out.

**Rationale**:
- It's an allowlist (FR-006). The result is built from nothing, so new stored fields never pass
  through.
- The compiler keeps the list and the documented DTO identical, and the DTO generates the
  contract. The three can't drift.
- No runtime magic. `_id` is converted with `String(...)`, dates stay `Date`, and the JSON stays
  byte-identical for every published field (FR-004, SC-004).
- It works on hydrated documents and on the plain objects that unit-test mocks return, because it
  only reads properties.

**Alternatives considered**:
- **`ClassSerializerInterceptor` + `@Expose` + `excludeExtraneousValues`** (the Nest-idiomatic
  route). Rejected after running it: `plainToInstance` keeps an ObjectId's string form only by
  accident (`toJSON`), and `instanceToPlain`, which is what the interceptor calls, turned every
  `_id`, nested ones included, into `{"buffer":{"type":"Buffer","data":[…]}}`. Every id would need
  a hand-written `@Transform`, and forgetting one silently breaks the mobile app.
- **Mongoose schema `toJSON` transform / `versionKey: false`**. Removes `__v`, but it's a denylist:
  a new stored field still leaks, which fails FR-006 and US2. It also changes how the store writes
  documents, which is outside this fix.
- **`.select()` / `.lean()` projections in queries**. Also an allowlist, but it lives in query
  code and isn't tied to the DTO. It doesn't cover `save()` results (create) or populated
  sub-documents without extra work.

## R3 — Where projection happens

**Decision**: in the service, as the last step of each public method that returns a record. The
service's return type becomes the response DTO.

**Rationale**: CLAUDE.md says "services own rules and are the only layer that touches models, and
responses are projected through DTOs". If the service returns the DTO, no Mongoose document ever
leaves it, and controllers stay HTTP-only. Internal callers that need the document (the auth
strategy's `findById`, `findByEmail`, reservations' `checkAvailability`) keep their current
document-returning methods, which no controller exposes.

**Alternative**: projecting in controllers. Rejected because it spreads the field lists over two
layers, and a controller could forget to call it.

## R4 — Nested records

- **Reservation items**: projected with `ReservationItemResponseDto`'s fields (already published,
  no `__v`).
- **Activity type inside an activity** (`GET /api/activity`, `GET /api/activity/:id`, populated):
  projected with `ActivityTypeResponseDto`'s fields (minus `__v`). Observed: when the activity type
  was deleted, the answer is `"type": null`. That must stay `null`.
- **Activity create and change** (`ActivityRecordResponseDto`) answer `type` as the id string, not
  populated. That stays.

## R5 — Optional fields and `undefined`

Fields the record doesn't hold (a reservation's `cost`, an activity type's `description`, an
item's `description`) are absent today. The projection copies a field only when it is not
`undefined`, so `JSON.stringify` output is unchanged. `null` values are copied as `null`.

## R6 — D17: what the account change writes

**Observed (2026-10-01)**: `PUT /api/users/:id` with `changePassword: false, password: "sent-pw"`
stored `"password":"sent-pw"` in plain text. Sign-in then refused both the previous password and
`sent-pw` (401), so the account is locked out. `currentPassword` and `changePassword` aren't stored
(the schema's strict mode drops them).

**Decision**: `UsersService.update` builds the `$set` from the account's own fields only (`email`,
`name`, `role`, and `password` **only** when `changePassword` is true, after verification and
hashing). `currentPassword` and `changePassword` are never part of the write. The DTO still
requires every field (D9 / #14 unchanged).

**Alternative**: deleting `password` from the incoming DTO when `changePassword` is false.
Rejected because it mutates a readonly DTO and still sends the other control fields to the store.
An explicit allowlist mirrors R2.

## R7 — D17 repair

**Decision**: a pure function `repairPlainTextPasswords(users: Model<User>, { apply: boolean })` in
`src/users/password-repair.ts` (where jest discovers it), plus a thin runner
`scripts/repair-plain-passwords.ts` that boots an application context (the `seed-dev-admin.ts`
pattern) and gets the model.

- **Detection**: a stored value is treated as a hash only if it matches the bcrypt format
  `^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$`. Anything else is plain text, including an empty
  string. A missing `password` is reported and skipped, because there's no value to hash.
- **Dry run by default**: it reports the count and each account's id (no email: the constitution keeps personal data out of logs). `--apply` writes.
  The runner refuses to start without `NODE_ENV` naming the env file, so the target database is
  always stated explicitly (FR-014).
- **Per-account compare-and-set**: `updateOne({ _id, password: <the plain value read> }, { $set:
  { password: hash } })`. That is idempotent, safe after an interruption, and never overwrites a
  value changed in between (FR-015).
- **No secret output**: it prints ids and counts only (FR-014). The test asserts that the
  captured output contains neither the plain value, the hash, nor the email.

**Alternatives considered**: a raw-driver script like `audit-user-roles.ts`. It works, but its
logic would sit outside jest's `rootDir`, untested (the reason `seed-dev-admin.ts` is a thin
runner). A migration framework is too much for one repair.

## R8 — Tests

- **New e2e** `test/records/record-fields.e2e-spec.ts`: for each of the 29 operations, run it and
  assert every key (and every nested record's keys) is within the contract's schema for it, using
  `test/docs/openapi-contract.ts`, and assert no `__v` at any depth. This generalises
  `contract-sample.e2e-spec.ts`'s exact-keys check from a sample to all of them.
- **US2 unit tests**: each projection function given a document with `password`, `__v` and an
  unknown field leaves all three out. `UsersService` given a document that still has its hash
  answers without it.
- **D3 discrepancy test**: removed from `contract-discrepancies.e2e-spec.ts` (it asserts `__v`), with
  its header comment updated.
- **D17 e2e** in `test/records/account-password.e2e-spec.ts`: sign-in with the previous and the
  sent passwords after each kind of change, plus the raw stored value is a bcrypt hash.
- **Repair e2e** against the in-memory Mongo: seed hashed and plain accounts, then check the dry
  run changes nothing, apply repairs only the plain ones, they sign in, a second run reports zero,
  and the output carries no secret.

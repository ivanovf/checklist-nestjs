---

description: "Task list for 009-fix-unprojected-records"
---

# Tasks: Stored Records Answered Only With Their Published Fields

**Input**: Design documents from `specs/009-fix-unprojected-records/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/record-responses.md, quickstart.md

**Tests**: Required. Constitution Principle I is test-first and non-negotiable, and a bug fix
needs a regression test that fails first. Every test task MUST be run and **seen failing for
the reason stated** before its implementation task starts.

**Organization**:

- **US1** (P1, issue #9, D3): answers carry only published fields. Projection in every service.
- **US2** (P2): sensitive or unknown stored fields can't leak, whatever the store returns.
- **US3** (P1, D17): an account change without a password change leaves the password alone, plus
  the one-off repair.

US1 and US3 are independent and can be done in either order. US2 depends on US1's projection
(it proves the allowlist holds against hostile input).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, US3

## Ground rules for every task

- Run commands through `zsh -ic '…'`. To run one e2e file, use
  `pnpm exec jest --config ./test/jest-e2e.json --runInBand <file>` (about 1–2 minutes on
  `/mnt/c`). `pnpm test:e2e -- <file>` doesn't pass the file through under pnpm 12.
- No `any` in new or modified code. Match the surrounding style: block comments that explain
  *why*, and the `createTestApp` / `seedAccounts` / `tokenFor` helpers from `test/security` and
  `test/support`.
- Test data MUST be synthetic. The e2e mongod is shared, so seed what each test needs and don't
  rely on other suites' records.
- **Published JSON must stay byte-identical** for every field except `__v` (SC-004): `_id` as a
  24-hex string, dates as ISO strings, optional fields absent (not `null`, not `undefined`) when
  the record has no value, and `null` kept as `null` (an orphaned activity's `type`).
- Don't use `ClassSerializerInterceptor` or `instanceToPlain`. It was proved to turn every
  `_id` into a buffer object (research R2).
- Out of scope, don't touch: D8 (invalid bodies returning 500), D9 (user updates need every
  field), D10 (the device key's 404), D15 (`lockUser` discarded), D16 (the 406 refusals), and
  anything under `src/auth/**`.

---

## Phase 1: Setup

- [X] T001 Confirm the branch is `009-fix-unprojected-records` and the baseline is green: run
  `pnpm test` and `pnpm test:e2e` on the current HEAD and note the pass counts. They are the
  reference for SC-004 ("existing suites pass without changing what they expect").

---

## Phase 2: Foundational (blocks US1 and US2)

- [X] T002 Write `src/common/projection.spec.ts` (fails first: the module doesn't exist) for a
  helper `project<T>(source, fields)`:
  - it copies only the listed fields, so `__v`, `password` and an unknown field on the source
    are all absent;
  - a listed field whose value is `undefined` is **absent** from the result
    (`Object.keys` doesn't include it);
  - `null` is kept as `null`;
  - `_id` holding a `Types.ObjectId` comes out as its 24-hex string;
  - `Date` values stay `Date` instances;
  - it works on a hydrated Mongoose document as well as on a plain object. Build one with
    `new (model('T', new Schema({ a: String }, { timestamps: true })))({ a: 'x' })`, with no
    connection needed.
- [X] T003 Implement `src/common/projection.ts`:
  - `export type FieldList<T> = { readonly [K in keyof Required<T>]: true }`, so a list that
    misses a DTO field, or names one the DTO lacks, fails to compile.
  - `export function project<T>(source: object, fields: FieldList<T>): T` reads each listed key
    by property access (Mongoose getters work), converts `_id` with `String(...)`, and skips
    `undefined`.
  - A block comment citing D3 / Principle II and why it is an allowlist rather than a denylist
    (research R2).
  - T002 passes.

**Checkpoint**: helper green. US1 can start, and US3 can start any time.

---

## Phase 3: User Story 1 - Answers carry only the published fields (Priority: P1) 🎯 MVP

**Goal**: all 29 record-returning operations answer with exactly their response DTO's fields, and
no `__v` at any depth (FR-001–004, FR-007–009).

**Independent Test**: `test/records/record-fields.e2e-spec.ts` passes: every operation's body (and
nested records) is within its contract schema, `required` fields are present, and there's no
`__v`/`password` anywhere.

### Tests for User Story 1 ⚠️ write first, see them fail

- [X] T004 [US1] Create `test/records/record-fields.e2e-spec.ts`, `describe('Record answers (009)')`:
  - A header comment citing specs/009-fix-unprojected-records, issue #9 and D3.
  - `beforeAll`: `createTestApp({ transport: true })`, `seedAccounts`, an admin token. Create
    through the API, in this order: an account, an item, a reservation (with
    `items: [{ label: 'l', status: true, description: 'd', category: 'c' }]`), a lock, a config,
    an activity type, and an activity of that type. Bodies are those in
    `test/records/record-ids.e2e-spec.ts` `BODIES`, using `status: 'COMPLETED'` or `'TODO'` for
    activities.
  - One `it.each` over all 29 operations (data-model.md "Used by" column): users and items, locks
    and reservations POST, GET all, GET :id, PUT :id; config POST, GET, PUT :id, PATCH :id (device
    body `{ analogLecture: 1, apiKey: process.env.TANK_API_KEY, time: 1 }`); activity-type POST,
    GET, GET :id, PUT :id, DELETE :id (deletes a separately created type); activity POST, GET,
    GET :id, PUT :id.
  - For each, look up the documented success schema with `documentedSuccess` from
    `test/docs/openapi-contract.ts`. Resolve `$ref`s, array `items` and nullable. Recursively
    assert that every key is a schema property, every `required` property is present, and nested
    objects follow their own schema (`items[]` → `ReservationItemResponseDto`, populated
    `type` → `ActivityTypeResponseDto`).
  - A separate assertion that walks the whole body and finds no key `__v` or `password` at any
    depth.
  - An orphan case: delete an activity's type, then `GET /api/activity/:id` and `GET /api/activity`
    answer `type: null` (passes today, and must keep passing).
  - **Seen failing**: the `__v` assertion fails on all 29 operations. Key-subset checks pass
    today, because the current contract lists `__v`.

### Implementation for User Story 1

Each module task below is test-then-code inside one file pair: first add the stated unit test
to the module's `*.service.spec.ts` and see it fail, then change the service. Model stubs that
return plain objects keep working, because `project` only reads properties. List stubs need an
`exec` step if the method now awaits `.exec()`.

- [X] T005 [P] [US1] DTOs: in each of `src/users/dto/user-response.dto.ts`,
  `src/items/dto/item-response.dto.ts`, `src/reservations/dto/reservation-response.dto.ts`,
  `src/locks/dto/lock-response.dto.ts`, `src/config/dto/config-response.dto.ts`,
  `src/activity-type/dto/activity-type-response.dto.ts` and
  `src/activity/dto/activity-response.dto.ts` (both classes there):
  - Remove `__v`.
  - Replace the "Documentation only … Nothing constructs it" comment with one saying the class is
    the projection target the service returns (D3 resolved by 009).
  - Next to each class, export its `FieldList` constant (e.g. `ITEM_RESPONSE_FIELDS`) and a
    `toXResponse(doc)` function built on `project`.
  - Nested shapes: `toReservationResponse` maps `items` through `ReservationItemResponseDto`'s
    list. `toActivityResponse` maps a populated `type` through `toActivityTypeResponse`, and
    keeps `null`.
  - `ActivityResponseDto.type` gets `@ApiProperty({ type: ActivityTypeResponseDto, nullable: true })`
    and the TS type `ActivityTypeResponseDto | null`.
  - `ActivityRecordResponseDto.type` stays `string`: `String(doc.type)`.
- [X] T006 [P] [US1] Items. In `src/items/items.service.spec.ts`, add: `create`, `findAll`,
  `findOne` and `update` answers carry no `__v` and `_id` is a string. Then, in
  `src/items/items.service.ts`, every public method that returns an item answers
  `ItemResponseDto` / `ItemResponseDto[]` via `toItemResponse`. `findAll` becomes `async` and
  awaits `.exec()`. `remove` is unchanged (`{ deleted }`).
- [X] T007 [P] [US1] Locks: the same as T006 in `src/locks/locks.service.spec.ts` and
  `src/locks/locks.service.ts` with `toLockResponse`.
- [X] T008 [P] [US1] Reservations. In `src/reservations/reservations.service.spec.ts`, add: answers
  and their nested items carry no `__v`, and an unset `cost` is absent. Then, in
  `src/reservations/reservations.service.ts`, project `create`, `findAll`, `findOne` and
  `update`. Keep `checkAvailability` as is: it isn't exposed.
- [X] T009 [P] [US1] Config. In `src/config/config.service.spec.ts`, add: `create`, `findAll`,
  `update` and `updateAnalogLecure` answers carry no `__v`. Then project them in
  `src/config/config.service.ts`. The device-key check and its order are unchanged.
- [X] T010 [P] [US1] Activity types. In `src/activity-type/activity-type.service.spec.ts`, add:
  `create`, `findAll`, `findOne`, `update` and `remove` answers carry no `__v`. Then project
  them in `src/activity-type/activity-type.service.ts` (through the existing `found()` helper's
  result). `findAll` awaits `.exec()`.
- [X] T011 [P] [US1] Activities. In `src/activity/activity.service.spec.ts`, add:
  - `findAll` and `findOne` answer `ActivityResponseDto` with the populated type projected (no
    `__v` inside), and `type: null` stays `null`;
  - `create` and `update` answer `ActivityRecordResponseDto` with `type` as a string.

  Then project them in `src/activity/activity.service.ts`. `remove` keeps returning the
  document (only the controller's `{ message }` is exposed). While touching `findAll`, replace
  `const query: any` with `FilterQuery<Activity>` from mongoose (no `any` in modified code).
- [X] T012 [P] [US1] Users. In `src/users/users.service.spec.ts`, add: `create`, `findAll`,
  `findOne` and `update` answer exactly `_id, email, name, role, createdAt, updatedAt` (no
  `__v`). Then, in `src/users/users.service.ts`, replace `skipPassword` with
  `toUserResponse` everywhere it is used. Delete `skipPassword` once nothing calls it: grep
  `src` and `test`. `findById` and `findByEmail` keep returning documents: the auth strategy and
  sign-in need them, and no controller exposes them.
  - *Done with a deviation*: `skipPassword` is **kept**, because `src/auth/services/auth.service.ts` uses it at sign-in, and `src/auth/**` needs its own security review (constitution). Every answer to callers now goes through `toUserResponse`. The unused `findOne(id, false)` branch, which returned the document with its hash, was removed.
- [X] T013 [US1] Controllers: for every handler of the 29 operations, make its return type the
  response DTO the service now returns, in `src/{users,items,reservations,locks,config,activity-type,activity}/*.controller.ts`.
  Don't change any decorator, guard or status. The controller specs' `toBe(result)` checks must
  still pass unchanged.
  - *Done, no code change*: every handler's return type is now the DTO by inference from the service. Explicit annotations would add nothing, and the Swagger plugin reads return types, so they risked contract churn. T014's diff confirmed that inference changed no route.
- [X] T014 [US1] Run `pnpm docs:export` to regenerate `openapi.json`. Check that
  `grep -c '"__v"' openapi.json` prints `0` and that `ActivityResponseDto.type` is nullable. Run
  `pnpm exec jest --config ./test/jest-e2e.json --runInBand test/docs`: completeness and sample
  are green.
- [X] T015 [US1] In `test/docs/contract-discrepancies.e2e-spec.ts`, remove the `D3: …` test, and
  add "D3 is fixed by specs/009-fix-unprojected-records (pinned by
  test/records/record-fields.e2e-spec.ts)" to the header's "Not here" paragraph.
- [X] T016 [US1] In `specs/005-openapi-contract-export/discrepancies.md`, D3 gets
  `**Evidence**` pointing to `test/records/record-fields.e2e-spec.ts` and a `**Status**: Resolved
  by specs/009-fix-unprojected-records (2026-MM-DD)`, followed by one sentence: every record answer
  is projected through its response DTO, and `__v` is gone. Also add an **Also found** line for
  the orphaned activity type answering `null`, now documented as nullable.
- [X] T017 [US1] Run T004's suite, then the full `pnpm test:e2e`. Everything is green, and no
  existing suite had to change what it expects, apart from T015 (SC-004).

**Checkpoint**: D3 fixed and contract regenerated. This is the MVP.

---

## Phase 4: User Story 2 - Sensitive fields can't leak by default (Priority: P2)

**Goal**: answers are built from the allowlist even when the store returns the hash or unknown
fields (FR-005, FR-006, SC-003).

**Independent Test**: a service given a document with `password`, `__v` and an unknown field
answers without any of them, and an extra field written straight into the database doesn't
reach the HTTP answer.

- [X] T018 [P] [US2] In `src/users/users.service.spec.ts`, mock `findById`/`find`/
  `findByIdAndUpdate` and `save` to return a document that **includes** `password: '$2b$10$…'`,
  `__v` and `legacy: 'x'`. Assert that `create`, `findAll`, `findOne` and `update` answer none of
  them. This must pass after T012. If it doesn't, T012 is wrong: fix it, not the test.
  - *Covered by T012's `answers` tests*: the faithful `doc()` stub carries the hash by default, plus `__v` and `legacy`, and every answer must equal exactly the six published fields.
- [X] T019 [P] [US2] Add a `describe('unpublished stored fields (US2)')` to
  `test/records/record-fields.e2e-spec.ts`:
  - insert an item and an account straight through the collection
    (`app.get<Connection>(getConnectionToken()).collection('items' | 'users').insertOne(...)`)
    with an extra `internalNote: 'x'` field (and, for the account, a bcrypt-shaped `password`);
  - `GET /api/items/:id`, `GET /api/items/all`, `GET /api/users/:id` and `GET /api/users/all` answer
    without `internalNote` or `password`.
  - Teeth check: with `toItemResponse` temporarily returning the document unprojected, both item cases failed. The revert was not committed.

  **Seen failing** if run against a temporarily reverted `toItemResponse`. That proves the test
  has teeth. Note the result in the PR rather than committing the revert.
- [X] T020 [P] [US2] Add a compile-time guard test in `src/common/projection.spec.ts`: a
  `// @ts-expect-error` line where a `FieldList<{ a: string }>` omits `a`, and another where it
  adds `b`. If the type stops enforcing exhaustiveness, `tsc` (via ts-jest) fails. The comment
  names why: FR-006, so the list can't drift from the DTO.

**Checkpoint**: allowlist proven against hostile input.

---

## Phase 5: User Story 3 - Changing account details leaves the password alone (Priority: P1)

**Goal**: D17 fixed (FR-010–012), and existing plain-text passwords repairable (FR-013–015).

**Independent Test**: after `PUT /api/users/:id` with `changePassword: false`, the previous
password signs in and the sent one doesn't. The repair turns seeded plain-text passwords into
hashes, idempotently, and prints no secret.

### Tests for User Story 3 ⚠️ write first, see them fail

- [X] T021 [P] [US3] Create `test/records/account-password.e2e-spec.ts`,
  `describe('Account password writes (009, D17)')`. Create an account through `POST /api/users`
  with password `orig-pw`.
  1. `PUT /api/users/:id` with `{ email, name: 'n2', role: 'authenticated', password: 'sent-pw',
     changePassword: false, currentPassword: 'whatever' }` → 200. Then `POST /api/login` with
     `orig-pw` → 201, and with `sent-pw` → 401. The raw stored `password` (read via
     `getConnectionToken()`) matches `/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/`. The name did
     change.
  2. A password change with `changePassword: true`, `currentPassword: 'orig-pw'` and
     `password: 'new-pw'` → 200. `new-pw` signs in and `orig-pw` doesn't. The stored value is a
     hash.
  3. A wrong `currentPassword` → 406 (unchanged, D16), and nothing about the account changed:
     the name is the same, and `orig-pw` still signs in.
  4. After create, the stored value is a hash.
  - Seen failing for D17: with only `$set: changes` swapped back to `$set: updateUserDto`, scenario 1 stored `sent-pw`. Scenario 2 also failed in that run, but only because the new code puts the hash in `changes` rather than back in the DTO. HEAD's original code passes scenario 2 (verified), so D17 is limited to `changePassword: false`.

  **Seen failing**: scenario 1 (`orig-pw` → 401, observed in the plan probe).
- [X] T022 [P] [US3] In `src/users/users.service.spec.ts`, add `update` tests:
  - with `changePassword: false`, `findByIdAndUpdate` is called with
    `{ $set: { email, name, role } }`: no `password`, `currentPassword` or `changePassword`;
  - with `changePassword: true` and a verified current password, `$set` includes `password` as a
    bcrypt hash (not the sent text), and nothing else beyond the account fields.

  **Seen failing**: today `$set` is the whole DTO.
- [X] T023 [P] [US3] Create `src/users/password-repair.spec.ts` for the pure parts of the repair:
  - `isBcryptHash(value)`: true for a real `bcrypt.hashSync('x', 4)`, and false for `'sent-pw'`,
    `''`, `undefined` and a 59-char lookalike with a bad prefix;
  - `formatReport(result)`: it contains the database name, the counts and each id, and contains
    no email or password even when the input objects carry them.

### Implementation for User Story 3

- [X] T024 [US3] Fix D17 in `src/users/users.service.ts` `update`. Build the `$set` explicitly
  from `email`, `name` and `role`. Add `password` only on the verified `changePassword: true`
  path, as the bcrypt hash. Never write `currentPassword` or `changePassword`. Add a block comment
  citing D17 and what was observed (a plain-text write that locks the account out). T021 and T022
  pass.
- [X] T025 [US3] Implement `src/users/password-repair.ts`:
  - export `isBcryptHash`, `formatReport` and
    `repairPlainTextPasswords(users: Model<User>, { apply }: { apply: boolean })`;
  - read with `.select('+password')`, using a `.lean()` cursor;
  - classify each account: hash → untouched; missing → skipped and reported; anything else → to
    repair;
  - with `apply`, for each one call `updateOne({ _id, password: <value read> }, { $set: {
    password: await bcrypt.hash(value, 10) } })`. That's compare-and-set: idempotent, safe after
    an interruption, and it never overwrites a value changed in between;
  - return `{ database, scanned, toRepair: ids[], repaired: number, skippedNoPassword: ids[] }`;
  - no logging inside. The runner prints `formatReport`. T023 passes.
- [X] T026 [US3] Create `test/records/password-repair.e2e-spec.ts` against the e2e mongod. Insert
  through the collection: two hashed accounts, two plain-text ones (`'plain-a'`, `'plain-b'`) and
  one with no password.
  - Dry run: it reports 2 to repair and 1 skipped, and the stored values are unchanged.
  - Apply: 2 repaired, both are now hashes, `POST /api/login` with `plain-a` → 201, and the hashed
    accounts are byte-identical.
  - Second apply: 0 repaired.
  - `formatReport` output contains no `plain-a`, no stored hash and no email.
  - *Deviation*: the suite boots its app against its own database (`…/password-repair`) on the shared in-memory server, because other suites leave deliberately fake hashes that the repair would rewrite. It was written before T025 but first run after it; it was then shown to have teeth by disabling the write (3 of 5 failed).

  Write it before T025 is finished and see it fail on import or assertion. It is placed here
  because it needs T025's signature.
- [X] T027 [US3] Create `scripts/repair-plain-passwords.ts`, a thin runner following
  `scripts/seed-dev-admin.ts`:
  - refuse to start with exit 2 and a clear message if `process.env.NODE_ENV` is unset;
  - `NestFactory.createApplicationContext(AppModule)` → `app.get(getModelToken(User.name))`;
  - `apply = process.argv.includes('--apply')`;
  - print `formatReport`;
  - exit 1 if it was a dry run and accounts need repair, 0 if nothing is left, 2 on error;
  - its header comment has usage, says the dry run is the default, and states the
    developer-machine rule for production credentials (plan, open item).
  - Smoke-tested on 2026-10-01. Without `NODE_ENV` it exits 2 with the message (`AppModule` is now imported lazily, because its config validation ran at import time and crashed first). A dry run against the local Docker database scanned 2 accounts and found 0 plain-text passwords. `--apply` was **not** run on local dev data; the e2e suite proves the writes.

  In `package.json`, add `"db:repair-passwords": "ts-node scripts/repair-plain-passwords.ts"`
  next to `db:seed`. Smoke-test it against local Docker Mongo per quickstart.md §3.
- [X] T028 [US3] Update the `PUT /api/users/:id` `@ApiOperation` description in
  `src/users/users.controller.ts`: `changePassword: false` leaves the password unchanged, and
  `password`/`currentPassword` are then ignored (contracts §2). No status changes.
- [X] T029 [US3] In `specs/005-openapi-contract-export/discrepancies.md`, add a **D17 — An account
  change stores the sent password as plain text ⚠️ security** entry in the register's format:
  - Operation(s): `PUT /api/users/:id`;
  - Observed: 2026-10-01, the plan probe (plain text stored, then 401 for both passwords);
  - Apparent intent;
  - Evidence: `test/records/account-password.e2e-spec.ts`;
  - Principle: III;
  - Issue: number, or "pending owner approval";
  - Status: Resolved by 009, with the repair command named.
- [X] T030 [US3] **Ask the owner** whether to open the GitHub issue for D17. Only on a yes, run
  `gh issue create` with the title "D17: An account change stores the sent password as plain text"
  and a body that describes the class of defect and points to the spec (no reproduction against
  real data, no personal data). Put its number in the register (T029) and in the PR's closing
  keywords.

**Checkpoint**: D17 fixed and repair proven. Running it on production stays the owner's action.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T031 Run `pnpm docs:export` again (T028 changed a description) and `pnpm docs:check`.
  `grep -c '"__v"' openapi.json` must still print `0`.
- [X] T032 [P] Mark `specs/009-fix-unprojected-records/spec.md` Status as `Implemented`, and tick
  the quickstart expectations you ran.
- [X] T033 Run `pnpm lint:ci`, `pnpm test` (coverage floors: 80% overall and 90% for `src/auth`,
  neither lowered), `pnpm test:e2e`, `pnpm build`, `pnpm docs:check` and
  `pnpm audit --audit-level high`. All are green.
- [X] T034 Commit on `009-fix-unprojected-records`, never `main`: imperative summary, no prefix,
  and a body saying why. Then run `VERIFY_E2E=1 pnpm verify` on the clean tree so the
  `pre-push` hook accepts the push.
- [X] T035 Open the PR. Its description:
  - closes #9 (and the D17 issue if T030 opened one);
  - states the e2e result;
  - flags Principle IV (`__v` removed from a published required field, in place per the owner's
    2026-10-01 decision, because the app doesn't read it) and Principle III (D17, the repair,
    and the open item on where to run it against production without using production
    credentials on a developer machine);
  - lists the principles touched (II, III, IV);
  - records T019's revert check.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T003)** → US1 and US2.
- **US1**: T004 first (it fails), then T005, then T006–T012 in parallel (different modules), then
  T013 → T014 → T015 → T016 → T017.
- **US2**: needs T003 and T012. T018–T020 in parallel.
- **US3**: independent of US1 and US2. It needs only Setup. T021–T023 in parallel (tests first),
  then T024, then T025 ↔ T026 (test written first), then T027 → T028 → T029 → T030.
- **Polish**: after all stories. T031 needs T014 and T028.
- Shared files to watch: `src/users/users.service.ts` and its spec are touched by T012, T018,
  T022 and T024. Do them in order (T012 → T018, T022 → T024), not in parallel.

### Parallel examples

```text
# US1 after T005:
T006 items · T007 locks · T008 reservations · T009 config · T010 activity-type · T011 activity · T012 users

# US3 tests:
T021 account-password e2e · T022 users.service update spec · T023 password-repair spec
```

## Implementation Strategy

1. **MVP** = Setup + Foundational + US1 (T001–T017). D3 is fixed and the contract regenerated,
   so it can be shipped alone.
2. **US3** next. It's P1 and a live security defect, so it can even go before US1 (only Setup
   needed).
3. **US2** hardens US1. It's cheap, mostly tests.
4. Polish, then one PR for both discrepancies (the owner's decision, Clarifications 2026-10-01).

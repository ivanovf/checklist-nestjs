---

description: "Task list for 014-fix-mistyped-fields"
---

# Tasks: Wrongly Typed Fields Are Refused, Not Server Errors

**Input**: Design documents from `specs/014-fix-mistyped-fields/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/request-types.md,
quickstart.md

**Tests**: Required. Constitution Principle I is test-first and non-negotiable, and a bug fix
needs a regression test that fails first. Every test task MUST be run and **seen failing for
the reason stated** before its implementation task begins.

**Organization**:

- One e2e suite, `test/records/field-types.e2e-spec.ts`, holds every regression case, in one
  `describe` block per story. All blocks are written in Phase 2 and run against today's code
  **before any source change**.
- Each story phase then makes its block green:
  - **US1** (P1): no wrongly typed value is a server error. The body pipe stops converting,
    dates get `IsDateText`, and `cost` gets a type.
  - **US2** (P2): what is accepted is what is stored. Most of this block turns green with US1's
    pipe change, because it has the same cause (research R1). US2 adds lock codes and retires
    the 010 test that kept text `"false"` working.
  - **US3** (P3): `null` can't empty a required field on a change.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, US3

## Ground rules for every task

- Run commands through `zsh -ic '…'` (fnm's Node 24, Linux pnpm).
- To run one e2e file, use `pnpm test:e2e test/records/field-types.e2e-spec.ts`. Don't use `--`,
  because pnpm 12 passes it through literally. Expect about 3–4 minutes on `/mnt/c`, and about
  13 minutes for the whole e2e run.
- No `any`. Match the surrounding style:
  - block comments that explain *why*;
  - the `createTestApp({ transport: true })` / `seedAccounts` / `tokenFor` helpers;
  - the `http` / `auth` / `model` / `message` / `stored` helpers as written in
    `test/records/unknown-fields.e2e-spec.ts`.
- **Shared database**: every e2e suite runs against the same in-memory mongod.
  - Reservations in this suite MUST use dates in **2010** (unique per record, as
    `unknown-fields` does with 2031). Other suites list reservations newest first with
    `limit=50`, and later dates push their records off the page. This was observed while
    planning.
  - `afterAll` MUST delete every record this suite created, by id, before closing the app.
- Test data MUST be synthetic.
- D9, D10, D12, D13 and D16 keep their pinned tests. Don't touch them.

---

## Phase 1: Setup

- [X] T001 Confirm the baseline on an unchanged tree.
  - Check that the branch is `014-fix-mistyped-fields`, based on `dev`
    (`git merge-base --is-ancestor origin/dev HEAD`).
  - Run `pnpm install`, `pnpm test` and `pnpm test:e2e`.
  - Record the totals in the PR notes. Expect 433 unit tests and 848 e2e tests, all green.

---

## Phase 2: Foundational (the regression suite, all red first)

**⚠️ CRITICAL**: No file under `src/` changes until T008 has been run and its failures recorded.

- [X] T002 Create the fixtures in `test/records/field-types.e2e-spec.ts`.
  - **Header comment**: regression suite for issue #13 (D8), `specs/014-fix-mistyped-fields`.
    Bodies were checked after implicit conversion but stored as sent (research R1). So
    wrongly typed values were either a 500 or silently stored converted, and `null` emptied
    required fields on a change.
  - **Imports and helpers**: as in `unknown-fields.e2e-spec.ts`. Keep the admin token and the
    guest token.
  - **Constants**: the `TYPE_MESSAGE` map, by kind:
    - text → `must be a string`
    - yes/no → `must be a boolean value`
    - number → `must be a number conforming to the specified constraints`
    - date → `must be a date in ISO 8601 format`
    - id → `must be a mongodb id`
  - **A `KINDS` table** of `{ kind, model, create(), fields: Record<field, Kind> }`, taken from
    `data-model.md` (§Fields):
    - items: `label`, `description`, `category`, `comments` text; `status`, `checked` yes/no
    - reservations: `dateIni`, `dateEnd` date; `type`, `contact` text; `validated` yes/no;
      `quantity`, `cost` number. `create()` uses unique 2010 dates.
    - locks: `lock`, `userNumber` text. `create()` gives `{ lock: '1234', userNumber: '3' }`.
    - activity-type: `name`, `description` text; `budget` number
    - activity: `type` id; `price` number; `date` date; `description` text. `create()` uses a
      type seeded in `beforeAll`, `status: 'TODO'` and `date: '2026-01-01T00:00:00.000'`.
    - config: `doorLock`, `mainLock` text; `usersLimit`, `analogLecture` number
    - users: `email`, `name`, `password` text. Change bodies are full (D9):
      `{ ...user(), changePassword: false, currentPassword: 'pw' }`.
  - **Helpers**:
    - `seed(kind)` → id
    - `created` (an id list per model), which `afterAll` deletes with `deleteMany({ _id: { $in } })`
    - `expectRefused(res, field, kind)`: status 400, and `message(res)` contains
      `` `${field} ${TYPE_MESSAGE[kind]}` ``
    - `expectUnchanged(name, id, before)`: `stored(...)` deep-equals `before`
- [X] T003 [P] Write the **US1 block** in `test/records/field-types.e2e-spec.ts`: `describe('no wrongly typed value is a server error (US1)')`. Today each of these is a 500 (research R1, contracts/request-types.md).
  - **Matrix**, `describe.each` over `KINDS` × fields:
    - an object `{ not: 'x' }` for every text field;
    - `'abc'`, `7` and `{}` for every yes/no field;
    - `true` for every date field;
    - `'abc'`, `{}` and `['x']` for reservation `cost`.
  - For each value:
    - **create** with the field replaced → `expectRefused`, and the model's `countDocuments()`
      is unchanged;
    - **change** with `{ [field]: value }` on a seeded record → `expectRefused` and
      `expectUnchanged`. For users, send the full change body with the field replaced.
  - **Nested entries**: create a reservation, and change one, whose `items[0]` has `label: {}`,
    then `status: 'abc'`, then `status: 7` → 400 naming `items.0.label` / `items.0.status`.
  - **Several bad fields**: `{ label: {}, status: 'abc' }` on an item change → one 400 whose
    message names both.
  - **Mixed with an undeclared field**: `{ label: {}, extra: 1 }` → 400 naming `label` and
    `property extra should not exist`.
  - **Device** (`PATCH /api/config/:id`, report helper as in `unknown-fields`): `analogLecture: '1'`, `true` or `{}` → 400 naming it; `time: '1'` → 400; `apiKey: 5` → 400. A well-typed wrong key is still **404** `Invalid API Key` (D10).
  - **Recovery**: `POST /api/password-recovery/complete`
    `{ email: 'x@test.local', code: '123456', newPassword: 12345678 }` → 400 naming
    `newPassword`. Send it only once; the route is throttled.
  - **Order**:
    - no token + bad body → 401;
    - guest + bad body on `POST /api/items` → 403;
    - malformed path id + bad body → 400 `Invalid id`;
    - a reservation change with `dateIni: true` on dates already taken → 400 naming `dateIni`,
      not `Reservation not available`.
- [X] T004 [P] Write the **US2 block** in `test/records/field-types.e2e-spec.ts`: `describe('what is accepted is what is stored (US2)')`. Today each of these succeeds and stores a converted value.
  - **Matrix** over `KINDS` × fields, on create and change, each → `expectRefused` and nothing
    created or changed:
    - `7` and `true` for every text field;
    - `true` and `'3'` for every number field;
    - `7` and `'2026-02-30'` for every date field. Also `'20260101'` and `'2026-W01'`, which
      are refused today (research R3) and must stay refused: green throughout;
    - `1234` for the lock's `lock` and `3` for `userNumber`;
    - `'false'` for every yes/no field.
  - **Accounts**: `changePassword: 'abc'` on `PUT /api/users/:id` → 400 naming
    `changePassword`.
  - **Reservation lock**: `userLock: 7` → 400 (`IsLockReference`).
- [X] T005 [P] Write the **US3 block** in `test/records/field-types.e2e-spec.ts`: `describe('a change cannot empty a required field (US3)')`.
  - For each kind's non-nullable field (every field in `KINDS`, plus reservation `items`,
    minus the nullable ones below): change `{ [field]: null }` → 400 naming the field, and
    `expectUnchanged`. Users are excluded, because their change body is full and already
    refuses `null` (D9).
  - **Nullable fields** still clear with **200**:
    - reservation `cost` → stored `null`;
    - reservation `userLock` → absent from the answer and the record (spec 010);
    - activity `description` and activity-type `description` → `null`.
  - **Create** with `{ label: null }` on items → 400, as today. This case stays green throughout.
- [X] T006 [P] Write the **app payloads block** in `test/records/field-types.e2e-spec.ts`: `describe('mobile app payloads keep working (FR-003)')`. These are green today and MUST stay green. Each body is built exactly as the Flutter `toJson()` does (research R7), and each case reads the record back with `stored` and checks the kinds:
  - **reservation**: create and full edit with `_id`, ISO dates without offset
    (`2010-03-01T00:00:00.000`), `cost: 120.5`, `quantity: 2`, `type: 'direct'`,
    `validated: false`, `userLock: '03'`, and items with `_id`, `label`, `description`,
    `checked`, `comments`, `category` and `status`. Then the same edit with `validated: true`.
  - **activity**: create and edit with `date`, `price: 35000`, `description`,
    `status: 'COMPLETED'` and `_id`.
  - **activity type**: `{ _id, name, description, budget: 10.5 }`.
  - **lock**: `{ _id, userNumber: '05', lock: '4321' }`.
  - **account**: `{ name, email, role }` plus `changePassword: true`, `password` and
    `currentPassword`.
  - **date forms**: `2010-04-01`, `2010-04-02T00:00:00.000Z` and `2010-04-03T10:00:00-05:00`
    are each accepted on create.
- [X] T007 [P] Write the unit spec `src/validators/date-text.validator.spec.ts` for `IsDateText`, following `src/validators/lock-reference.validator.spec.ts`: validate a small decorated class with `validate()` from class-validator.
  - **Accepted**: `'2026-01-01'`, `'2026-01-01T00:00:00.000'`, `'2026-01-01T00:00:00.000Z'`,
    `'2026-01-01T10:00:00-05:00'`
  - **Refused**: `7`, `true`, `null`, `{}`, `[]`, `''`, `'not-a-date'`, `'2026-02-30'`,
    `'2026-13-01'`, `'20260101'`, `'2026-W01'`
  - The message is `<property> must be a date in ISO 8601 format`.

  The spec fails to compile until T010.
- [X] T008 Run `pnpm test:e2e test/records/field-types.e2e-spec.ts` on the unchanged `src/`, and record the result in the PR notes. Expected:
  - **US1**: the cases fail with 500. Exceptions already observed as 400 today: `checked` and
    `comments` refuse every wrong kind but `null`.
  - **US2**: the cases fail with 200/201. Exceptions: a number for `role` is a 500 today (the
    D12 enum cast), and `'20260101'`/`'2026-W01'` are already 400.
  - **US3**: the required-field cases fail with 200; the nullable and create cases pass.
  - **App payloads**: all pass.

  Any case that fails for another reason is a test bug: fix it before going on.

**Result (2026-10-02)**: baseline 433/433 unit tests. The new suite has 242 tests: 210 red and 32 green.
- **Red, for the stated reasons**:
  - US1: 56 answered 500; 4 answered 200 (device text and `true` values, and an object password on an account change, which the service ignores); `apiKey: 5` answered 404 (converted to text); recovery reached the service.
  - US2: 100 answered 2xx; a number or `true` for `role` answered 500 (D12's enum cast).
  - US3: 25 answered 200.
- **Red with a different 400 message**:
  - lock fields given an object or `true`: the digits rule refuses them. They turn green with `IsString` (T015), so they stay red at T014;
  - `20260101` and `2026-W01` for dates: `must be a Date instance`;
  - the undeclared-field case, where the object label was not reported.
- **Green, as predicted**: `checked` and `comments` already refuse; `analogLecture: {}`; D10; the order cases; the nullable clears; every app payload.

**Checkpoint**: the suite is red for the stated reasons only, and `src/` is untouched.

---

## Phase 3: User Story 1 — no server error from a wrongly typed field (Priority: P1) 🎯 MVP

**Goal**: every value that answered 500 is a 400 naming the field (FR-001, FR-002, FR-006).

**Independent Test**: the US1 block of `field-types.e2e-spec.ts` is green.

- [X] T009 [P] [US1] Update `src/common/pipes/request-validation.pipe.spec.ts`.
  - Rewrite "passes values on unconverted":
    - send a valid `CreateReservationDto`-shaped body whose `dateIni` is the text
      `'2026-01-01T00:00:00.000'`;
    - assert that `received` strictly equals `sent` and that `dateIni` is still a string. (Use
      an item with `status: true` if reservation DTO metadata makes the sample heavy.)
  - Add "refuses a wrongly typed body value instead of converting it": `status: 'false'`,
    `label: 7` and `label: {}` on `CreateItemDto` each throw `BadRequestException`, naming the
    field.
  - Add "still converts query values": a `PaginationQueryDto` (`src/filter_dto/pagination-query.dto.ts`) query `{ limit: '5' }` passes.
  - Re-read the comment on the "lists an undeclared field together with the other errors" case:
    it explains the old conversion. Update it so it describes the new behaviour; keep the
    assertion if it still holds.
- [X] T010 [P] [US1] Create `src/validators/date-text.validator.ts`, exporting `IsDateText(validationOptions?)`. Use the `registerDecorator` pattern of `src/validators/lock-reference.validator.ts`.
  - **Valid** when `typeof value === 'string' && isISO8601(value, { strict: true }) &&
    !Number.isNaN(new Date(value).getTime())`.
  - **Message**: `${property} must be a date in ISO 8601 format`.
  - **Doc comment**: JSON has no date kind, so dates arrive as text. Strict ISO 8601 alone lets
    `20260101` and `2026-W01` through, and they don't parse, which would be a Mongoose cast
    error (research R3).

  T007 then passes.
- [X] T011 [US1] Change `src/common/pipes/request-validation.pipe.ts`.
  - Add a `bodyPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`,
    with **no** `transformOptions`.
  - Route `metadata.type === 'body'` to it, still returning `value` as sent. Queries keep
    `strictPipe` (with conversion), and params keep `argumentPipe`.
  - Extend the class comment: bodies are checked as sent, because the checked copy used to
    differ from the stored value (D8, `specs/014-fix-mistyped-fields`, research R1–R2). Queries
    are always text and are converted by their route pipes.

  T009 then passes.
- [X] T012 [US1] In `src/reservations/dto/create-reservation.dto.ts`:
  - replace `@IsDate()` with `@IsDateText()` on `dateIni` and `dateEnd`, and drop the
    now-unused `IsDate` import;
  - add `@IsNumber()` under `@IsOptional()` on `cost`.

  Keep the `Date` TypeScript type and the `@ApiProperty()`s, so the schema stays
  `string`/`date-time` (research R6).
- [X] T013 [P] [US1] In `src/activity/dto/create-activity.dto.ts`, replace `@IsDate()` with `@IsDateText()` on `date`, and drop the unused import.
- [X] T014 [US1] Run `pnpm test:e2e test/records/field-types.e2e-spec.ts`. The US1 block passes in full, and the app payloads block still passes. Then run the full `pnpm test:e2e`. Only these may fail:
  - `contract-discrepancies` › D8 (retired in T021);
  - `unknown-fields` › the text `"false"` case (inverted in T016).

  Any other failure is either a test sending the wrong kind (fix it, and list it for the PR) or
  a regression (stop, and revisit research R2).

**Result (2026-10-02)**: after T009–T013, `field-types` had 205 of 242 green. The 37 still
red were exactly the lock codes (needing T015) and `null` on change (needing T018). The full
e2e run in T014 was folded into a single run after T018 and T021, so it wasn't repeated three
times at about 13 minutes each.

**Checkpoint**: no wrongly typed value produces a 500. US1 is shippable on its own.

---

## Phase 4: User Story 2 — what is accepted is what is stored (Priority: P2)

**Goal**: no value is accepted in a converted form (FR-004, FR-005).

**Independent Test**: the US2 block of `field-types.e2e-spec.ts` is green, and reading each
record back shows it unchanged.

- [X] T015 [US2] In `src/locks/dto/create-lock.dto.ts`, add `@IsString()` to `lock` and `userNumber`, above `@IsDigitalNumber(...)`, and import `IsString`. Don't change `IsDigitalNumber`. Its acceptance of `"12ab"` is out of scope (research R4, proposed D18).
- [X] T016 [US2] In `test/records/unknown-fields.e2e-spec.ts`, invert "a status sent as the text "false" is stored as false, as before":
  - rename it "a status sent as the text "false" is refused (014)";
  - expect **400** naming `status`;
  - check that no item was created.

  Comment that spec 014 FR-005 (clarified 2026-10-02) refuses text for yes/no, and that the
  mobile app sends booleans (research R7).
- [X] T017 [US2] Run `field-types` again. The US2 block passes in full. Any case still green-for-the-wrong-reason (2xx) points to a field without a type check: add the check to its create DTO and list it in the PR.

**Checkpoint**: every accepted value has its declared kind (SC-003, first half).

---

## Phase 5: User Story 3 — a change cannot empty a required field (Priority: P3)

**Goal**: `null` for a field that create requires is refused on change; nullable fields still
clear (FR-007).

**Independent Test**: the US3 block of `field-types.e2e-spec.ts` is green.

- [X] T018 [P] [US3] Change `extends PartialType(Create…Dto)` to `extends PartialType(Create…Dto, { skipNullProperties: false })` in all six change DTOs:
  - `src/items/dto/update-item.dto.ts`
  - `src/reservations/dto/update-reservation.dto.ts`
  - `src/locks/dto/update-lock.dto.ts`
  - `src/activity/dto/update-activity.dto.ts`
  - `src/activity-type/dto/update-activity-type.dto.ts`
  - `src/config/dto/update-config.dto.ts`

  Add a one-line comment in each: an omitted field is skipped, but a `null` one is checked like
  on create (D8 / spec 014, research R5). `UpdateUserDto` and `TankLevelConfigDto` are not
  partial and are left alone.
- [X] T019 [US3] Run `field-types` in full. Every block passes, including the app payloads.

**Result (2026-10-03)**:
- **Full e2e**: 18 of 19 suites passed (846 tests: the 847 baseline minus the retired D8 pin).
  `field-types` timed out in `beforeAll` (30 s) because a coverage run was competing for CPU.
  Run alone with `unknown-fields` and `contract-discrepancies`, it passed: 372/372, with
  `field-types` at 242/242.
- **Unit**: 453/453; coverage 93.6% overall, and 100% for the pipe and `IsDateText`.
- **Other**: lint is clean, and `docs:check` reports `openapi.json is up to date`.
- **Tests fixed beyond the plan**: none.

**Checkpoint**: all three stories are green (SC-001 to SC-003).

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T020 Run `pnpm build && pnpm docs:check`. Expect `openapi.json is up to date` (research R6). If it isn't, run `pnpm docs:export`, and review the diff: only date or nullable metadata may differ. Commit `openapi.json`, and say why in the PR.
- [X] T021 [P] In `test/docs/contract-discrepancies.e2e-spec.ts`:
  - delete the `D8: …` case;
  - add D8 to the header comment's "Not here" list ("D8 is fixed by
    specs/014-fix-mistyped-fields (pinned by test/records/field-types.e2e-spec.ts)");
  - remove the now-unused `item` fixture if no other case uses it.
- [X] T022 [P] Update `specs/005-openapi-contract-export/discrepancies.md`:
  - **D8**:
    - correct **Operation(s)** to "every route with a body, on create and change (16
      operations); locks only partly";
    - add an **Also found** (observed 2026-10-02) covering: the 49 combinations; activity
      types and activities wrongly recorded as 400; the silent conversions (numbers as text,
      `true` as 1, numbers as 1970 dates, `"abc"` read as yes on a password change); `cost`
      unchecked; `null` emptying required fields on a change;
    - point **Evidence** at `test/records/field-types.e2e-spec.ts`;
    - add a **Status**: "Resolved by `specs/014-fix-mistyped-fields` (date). Bodies are checked
      as sent, without conversion; dates are ISO 8601 text that is a real date; a change
      refuses `null` for fields create requires. The contract was unchanged: it already
      declared every kind and 400."
  - **D18**, a new entry: "A lock code accepts text that only starts with digits". Cover:
    - operations: `POST`/`PUT /api/locks`;
    - observed (2026-10-02, run on the validator): `"12ab"`, `" 7"`, `"0x10"` and `"1e3"` are
      accepted, because `IsDigitalNumber` uses `parseInt`;
    - apparent intent: digits only;
    - evidence: none yet, recorded only;
    - principle: IV;
    - issue: none yet; open one only with the owner's approval.
- [X] T023 [P] In `CLAUDE.md` (the **Hardening** bullet), change "strict bodies and queries" to "strict bodies and queries; bodies are checked as sent, never type-converted".
- [X] T024 [P] Set `**Status**: Implemented` in `specs/014-fix-mistyped-fields/spec.md`, and tick the completed tasks in this file.
- [ ] T025 Run `pnpm lint:ci`, `pnpm test --coverage` (80% overall and 90% for `src/auth`) and `pnpm test:e2e`, all green. Then commit:
  - check the branch first (never `dev` or `main`);
  - use an imperative summary and a body explaining why;
  - add the attribution trailer.

  Then run `VERIFY_E2E=1 pnpm verify` on the clean tree, which takes about 25 minutes.
- [ ] T026 Run the manual checks in `specs/014-fix-mistyped-fields/quickstart.md` §2 against `pnpm start:dev`. Ask the owner to run §3 (the mobile app smoke test) on the preview deployment before `dev` is promoted to `main`.
- [ ] T027 Open the PR against `dev` (`gh pr create --base dev`) with `Closes #13`. The PR description must state:
  - the principles touched (I, IV), and that there is no deviation;
  - the in-place behaviour changes: text `"false"`, numbers as lock codes or text, `true` as
    a number, numbers as dates, impossible dates, and `null` for required fields on a change
    are now 400;
  - the device payload is unverified from source (research R7);
  - any tests fixed in T014/T017;
  - the proposed D18, and that it needs the owner's approval for an issue;
  - `specs/README.md` (named in `CLAUDE.md`) doesn't exist on this branch, so it wasn't
    updated;
  - the e2e result.

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2**: the baseline first.
- **Phase 2 (T002 → T003–T007 → T008)**: T003–T006 all edit the same file, so write them one
  after another. They are marked [P] only against T007. T008 gates all `src/` changes.
- **US1 (T009–T014)**: T009 and T010 first (they're independent). T011 needs T009. T012 and
  T013 need T010. T014 last.
- **US2 (T015–T017)**: needs US1. Most of its block is turned green by T011, because the cause
  is shared.
- **US3 (T018–T019)**: needs only Phase 2. In practice run it after US1, so T019 sees every
  block green.
- **Polish**: T020–T024 after T019. T021–T024 can run in parallel. T025 → T026 → T027.

## Parallel Example: User Story 1

```text
T009 pipe spec  ─┐
T010 IsDateText ─┼─ then T011 pipe, T012 reservation DTO + T013 activity DTO (parallel) → T014
```

## Implementation Strategy

- **MVP**: Phases 1–3 (US1). That alone closes the reported defect: no 500 from any wrongly
  typed body. It is shippable if US2 or US3 has to wait.
- **Increment 2**: US2. It's small once US1 lands: lock codes and the 010 inversion.
- **Increment 3**: US3, which is six one-line DTO changes.
- One PR for all three is the plan, since the change is small. Splitting stays possible because
  each story's block is independent.

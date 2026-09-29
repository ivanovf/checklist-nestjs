---

description: "Task list for 006-fix-reservation-paging"
---

# Tasks: Usable Paging on the Reservation List

**Input**: Design documents from `specs/006-fix-reservation-paging/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/reservation-list.md, quickstart.md

**Tests**: Required. Constitution Principle I is test-first and non-negotiable, and a bug fix
needs a regression test that reproduces the bug before the fix lands. Every test task below
MUST be run and **seen failing for the reason given** before its implementation task starts.

**Organization**: Tasks are grouped by user story. US1 = paging works (P1), US2 = paging with
filters (P2), US3 = clear refusals (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: The user story the task belongs to (US1, US2, US3)

## Ground rules for every task

- Run commands through `zsh -ic '…'` (see memory: WSL environment). The e2e suite is always
  `--runInBand`. To run one e2e file: `pnpm test:e2e -- test/reservations/reservation-paging.e2e-spec.ts`.
- No `any` in new or modified code. Match the surrounding style: explanatory block comments
  that say *why*, and the `createTestApp` / `seedAccounts` / `tokenFor` helpers from
  `test/security/app-factory.ts` and `test/support/auth-fixtures.ts`.
- Seed through the Mongoose model (`app.get<Model<Reservation>>(getModelToken(Reservation.name))`),
  not through `POST /api/reservations`, so the tests don't depend on the create route.
- Test data MUST be synthetic (constitution: Security & Data Protection).

---

## Phase 1: Setup (Shared Test Fixture)

**Purpose**: One e2e file with a deterministic seed that every story's tests extend.

- [X] T001 Create `test/reservations/reservation-paging.e2e-spec.ts` with a `describe('GET /api/reservations/all paging (006)')` block. It boots `createTestApp({ transport: true })`, seeds accounts, and gets an **admin** token. `beforeAll` inserts exactly **25** synthetic reservations through the model: `dateIni` = 2026-01-01 … 2026-01-05 with **5 reservations per date**, so there are ties. `type`: 15 `direct`, 5 `airbnb`, 5 `booking`, interleaved across dates. `dateEnd`: 10 in the past (2026-01-10) and 15 in the future (2027-01-10). `validated`: true for 8 and false for 17. `contact`: `c0`…`c24`. `quantity`: 1. Add small helpers `list(query: string)`, which returns the supertest response with the bearer header set, and `ids(res)`, which maps the body to `_id` strings. Add one smoke `it` that asserts `list('')` returns 200, so the file runs. Document the fixture's counts in a comment at the top, because every later assertion depends on them.

**Checkpoint**: `pnpm test:e2e -- test/reservations/reservation-paging.e2e-spec.ts` runs green with one test.

---

## Phase 2: Foundational (converted query reaches the handler safely)

**Purpose**: Research R1, R2 and R4. The handler must receive the converted, defaulted DTO,
and the boolean flags must survive that conversion. Every story depends on this. The boolean
fix MUST land before or together with the pipe, because the pipe alone would turn
`validated=true`/`old=true` into `false` (R4).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Create `src/filter_dto/filter-reservation.dto.spec.ts`. Use `plainToInstance(FilterReservationsDto, query, { enableImplicitConversion: true })` plus `validateSync`, the same options as the global pipe in `src/bootstrap.ts`. Assert that `{ validated: 'true' }` → `validated === true`, `{ validated: 'false' }` → `false`, `{ old: 'true' }` → `true`, and `{ old: 'false' }` → `false`. Assert that `{ old: 'yes' }` and `{ validated: '1' }` produce a validation error on that property. Assert that `{}` → `sort === 'desc'` and `old`/`validated` are `undefined`. Also run the true/false cases with `enableImplicitConversion: false` and expect the same results. **Expect failure** today: under implicit conversion, `'true'` yields `false` (R4 table), and `'yes'` passes validation.
- [X] T002b [P] In `test/reservations/reservation-paging.e2e-spec.ts`, add `describe('Phase 2 regression')` with one case: `old=false` returns all 25 reservations (not the 10 past stays). **Expect failure** today: it returns 10 (research, observed table). T013(c) later repeats it alongside the paging cases.
- [X] T003 Fix both boolean `@Transform`s in `src/filter_dto/filter-reservation.dto.ts` so they read the **raw** value from `({ obj, key })`: `'true'` → `true`, `'false'` → `false`, and anything else is returned unchanged so `@IsBoolean` refuses it. Put the shared logic in one small local function, and add a comment explaining why the raw value is used (implicit conversion runs before `@Transform`; research R4). Make T002 pass.
- [X] T004 [P] In `src/reservations/reservations.controller.spec.ts`, add a test that reads the route-argument metadata of `ReservationsController.findAll` (`ROUTE_ARGS_METADATA` from `@nestjs/common/constants`). It asserts that the `@Query()` argument carries a `ValidationPipe` instance, and that running that pipe's `transform` on `{ sort: 'asc' }` (valid today) with metatype `FilterReservationsDto` returns an instance of `FilterReservationsDto` with `limit === 10` and `offset === 0` (not a plain object), and that an unknown key such as `{ foo: 'x' }` is stripped (P1). **Expect failure** today: no pipe is bound.
- [X] T005 In `src/reservations/reservations.controller.ts`, bind `new ValidationPipe({ transform: true, transformOptions: { enableImplicitConversion: true } })` to the `@Query()` of `findAll`. Explain in a comment why it is route-scoped and not global: the global pipe validates but passes the raw query on, and a global `transform` would change every route's input, which is out of scope (research R2). Add `whitelist: true` (strip only: the service reads known keys only, so callers see no change; Principle IV). Do not add `forbidNonWhitelisted`, which would refuse requests and belongs to D5 / #10. Make T004 pass. Run `pnpm test` and confirm that the existing reservation controller and service specs are still green.

**Checkpoint**: The handler now receives a `FilterReservationsDto` with defaults. `limit`/`offset` are still refused, because they aren't converted yet (US1).

---

## Phase 3: User Story 1 - Read any page of reservations (Priority: P1) 🎯 MVP

**Goal**: `limit`/`offset` are accepted and optional, with defaults 10/0 that really bound
the result. The default order is newest-first. Pages never overlap and never leave gaps
(FR-001, FR-002, FR-005 valid range, FR-009; SC-001, SC-002, SC-004).

**Independent Test**: With the 25-reservation fixture, the page `limit=10` at offsets 0, 10
and 20 returns 10, 10 and 5 distinct ids covering all 25. The default request returns 10,
newest first.

### Tests for User Story 1 ⚠️ (write first, see them fail)

- [X] T006 [P] [US1] Create `src/filter_dto/filter-list.dto.spec.ts` (valid paths only). With the global pipe's options, `{}` → `limit === 10`, `offset === 0`; `{ limit: '5', offset: '0' }` → the **numbers** 5 and 0, with no validation errors; `{ limit: '50' }` → 50, valid; `{ limit: '1' }` → valid; `{ offset: '7' }` → 7 with `limit` 10. **Expect failure**: the values stay strings and `@IsNumber` refuses them (R1, R3).
- [X] T007 [P] [US1] In `src/reservations/reservations.service.spec.ts`, add a `describe('findAll')`. Mock the injected model so that `find()` returns a chainable stub with `limit`, `skip` and `sort` as `jest.fn()`s that return the stub. Assert that `findAll({ limit: 10, offset: 20, sort: 'desc' })` calls `limit(10)`, `skip(20)` and `sort({ dateIni: -1, _id: -1 })`, and that `sort: 'asc'` gives `sort({ dateIni: 1, _id: 1 })`. Follow how the existing spec provides the model token. **Expect failure**: the sort has no `_id` tie-break (R5).
- [X] T008 [P] [US1] In `test/reservations/reservation-paging.e2e-spec.ts`, add a `describe('US1')` with these cases:
  - (a) `list('')` → 200, length **10**, and `dateIni` values non-increasing (newest first).
  - (b) `limit=10` at offsets 0, 10 and 20 → lengths 10/10/5. Concatenated ids have 25 **distinct** values and equal the set of all seeded ids (SC-002).
  - (c) `limit=5` at offsets 0, 5, …, 20 → 25 distinct ids. This exercises ties within a date.
  - (d) `offset=30` → 200, `[]`.
  - (e) `sort=asc&limit=50&offset=0` → 200, length 25, `dateIni` non-decreasing.
  - (f) `limit=5` alone → 5, and `offset=20` alone → 5 (default limit 10, 5 remaining).
  - (g) `sort=desc&limit=10&offset=0` returns the same ids, in the same order, as `list('')` (the default sort is `desc`).

  **Expect failure**: (a) returns 25 today, and every case that sends `limit`/`offset` gets a 400.

### Implementation for User Story 1

- [X] T009 [US1] In `src/filter_dto/filter-list.dto.ts`, declare `limit?: number = 10` and `offset?: number = 0` with explicit `number` types. Decorate `limit` with `@IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)`, and `offset` with `@IsOptional() @Type(() => Number) @IsInt() @Min(0)`. Replace `@IsNumber`/`@IsPositive`. Export a `MAX_PAGE_SIZE = 50` constant and use it in `@Max`. Add a comment citing FR-005 and the constitution's Principle V hard maximum. Do **not** touch `src/filter_dto/pagination-query.dto.ts` (items, locks and users; out of scope). Make T006 pass.
- [X] T010 [US1] In `src/reservations/reservations.service.ts` `findAll`: sort with `{ dateIni: dir, _id: dir }`, where `dir` is `sort === 'asc' ? 1 : -1`, and add a comment that `_id` makes paging deterministic when start dates tie (R5). Replace `const filter: any` with `FilterQuery<Reservation>` from `mongoose`, keeping every existing filter key and condition exactly as it is. Make T007 pass.
- [X] T011 [P] [US1] In `src/reservations/entities/reservation.entity.ts`, after `SchemaFactory.createForClass`, add `ReservationSchema.index({ dateIni: -1, _id: -1 })` for the list sort in both directions, plus single-field indexes `{ type: 1 }`, `{ validated: 1 }` and `{ dateEnd: 1 }` for the list filters. The comment cites Principle V: every filter or sort field on a query this change touches is indexed (research R6, analysis C1). Add a unit test in `src/reservations/entities/reservation.entity.spec.ts` that asserts `ReservationSchema.indexes()` contains those four keys.
- [X] T012 [US1] Run `pnpm test` and `pnpm test:e2e -- test/reservations/reservation-paging.e2e-spec.ts`. T006, T007 and T008 must now pass. If T008 (b) or (c) shows duplicates or gaps, fix the sort before moving on; don't loosen the test.

**Checkpoint**: MVP. Bug #16 is fixed: any valid page can be read, and the default is bounded and newest first.

---

## Phase 4: User Story 2 - Page through a filtered list (Priority: P2)

**Goal**: Paging combines with every filter, and the flags mean what they say (FR-004, FR-010).

**Independent Test**: `type=direct&limit=10&offset=10` returns exactly the last 5 of the 15
direct reservations. `old=false` no longer filters like `old=true`.

### Tests for User Story 2 ⚠️

- [X] T013 [P] [US2] In `test/reservations/reservation-paging.e2e-spec.ts`, add a `describe('US2')` with these cases:
  - (a) `type=direct&limit=10&offset=0` and `type=direct&limit=10&offset=10` → 10 and 5, all `type === 'direct'`, and 15 distinct ids in total.
  - (b) `old=true&limit=50` → exactly the **10** past-stay reservations.
  - (c) `old=false&limit=50` → all **25**. This is the regression for the observed defect, where `old=false` gave 10.
  - (d) `validated=true&limit=50` → the **8** validated reservations; `validated=false&limit=50` → the **17** others.
  - (e) `type=direct&sort=asc&limit=5&offset=5` → 5 direct reservations, with `dateIni` non-decreasing.
  - (f) `dateFrom=2026-01-03T00:00:00.000Z&limit=50` → only reservations with `dateIni` ≥ that date. Compute the expected count from the fixture.

  **Expect** (c) to fail if T003/T005 were reverted, and every case to pass once Phases 2 and 3 are in. If any case fails for another reason, investigate it; don't adjust the expectation.
- [X] T014 [P] [US2] In `src/reservations/reservations.service.spec.ts` `describe('findAll')`, assert the filter passed to `find()`: `{ old: false }` adds **no** `dateEnd` key, `{ old: true }` adds `dateEnd: { $lte: <today YYYY-MM-DD> }`, `{ validated: false }` adds `validated: false`, `{ type: 'direct' }` adds `type`, and `{}` gives `{}`.

### Implementation for User Story 2

- [X] T015 [US2] Run T013 and T014. No production change is expected, because Phase 2 (booleans and pipe) and T010 (typed filter) cover it. If a case fails, fix it in `src/reservations/reservations.service.ts` without changing the meaning of any filter. The `old` + `dateTo` clash on `dateEnd` is explicitly out of scope (spec Assumptions); leave it and don't test it.

**Checkpoint**: US1 and US2 both pass independently.

---

## Phase 5: User Story 3 - Clear refusal of invalid paging values (Priority: P3)

**Goal**: Invalid paging and flag values are refused with 400, and the message names the
field. Above 50 is refused, never clamped (FR-003, FR-005, FR-010).

**Independent Test**: `sort=asc&limit=200&offset=0` → 400, and the message mentions `limit`
and 50.

### Tests for User Story 3 ⚠️

- [X] T016 [P] [US3] Extend `src/filter_dto/filter-list.dto.spec.ts` with refusal cases, using `it.each`. `limit`: `'0'`, `'-1'`, `'2.5'`, `'abc'`, `'51'`, `'200'`, `''`, `['5','7']`. `offset`: `'-1'`, `'2.5'`, `'abc'`, `['0','1']`. For each, assert that `validateSync` reports an error on exactly that property. For `'51'`, also assert that the constraint message contains `50`.
- [X] T017 [P] [US3] In `test/reservations/reservation-paging.e2e-spec.ts`, add a `describe('US3')` with these cases:
  - (a) `sort=asc&limit=200&offset=0` → 400, and `body.message` contains a string that includes both `limit` and `50` (the user's original request).
  - (b) `it.each` over `limit=0`, `limit=-1`, `limit=2.5`, `limit=abc`, `limit=51`, `limit=5&limit=7` → 400, with some message containing `limit`.
  - (c) `offset=-1`, `offset=abc` → 400, with a message containing `offset`.
  - (d) `old=yes`, `validated=1` → 400, with a message naming the field.
  - (e) `limit=50` → 200 (the boundary is accepted).
  - (f) no `Authorization` header, with `limit=10&offset=0` → **401** (auth still comes first).

### Implementation for User Story 3

- [X] T018 [US3] Run T016 and T017. They should pass on T009/T003 alone. If the default class-validator message for `@Max` doesn't include the number (expected: `limit must not be greater than 50`), add an explicit `message` to `@Max` in `src/filter_dto/filter-list.dto.ts` that names `limit` and `MAX_PAGE_SIZE`.

**Checkpoint**: All three stories pass independently.

---

## Phase 6: Polish, Contract and Register (cross-cutting)

**Purpose**: FR-007 and FR-008. The contract, the register and the discrepancy tests must
agree with the new behaviour in the same PR (CLAUDE.md conventions).

- [X] T019 In `src/reservations/reservations.controller.ts`, rewrite the two `@ApiQuery` blocks for `limit` and `offset`. `limit`: `required: false`, `type: Number`, `minimum: 1`, `maximum: 50` (use `MAX_PAGE_SIZE`), `default: 10`, and a description along the lines of "Page size, 1–50. Defaults to 10. Larger values are refused with 400." `offset`: `minimum: 0`, `default: 0`, and a description along the lines of "Reservations to skip. Defaults to 0." Remove every mention of D11 and "omit it". Keep the comment that says why the queries are declared by hand (Swagger does not expand the parent class). Add `@ApiPropertyOptional({ enum: ['true', 'false'] … })` wording, or a description on `old`/`validated` in `src/filter_dto/filter-reservation.dto.ts`, stating that only `true`/`false` are accepted (FR-007).
- [X] T020 In `test/docs/contract-discrepancies.e2e-spec.ts`, delete the `it('D11: …')` case, and extend the header comment's "Not here:" list to say D11 was fixed by 006 and is pinned by `test/reservations/reservation-paging.e2e-spec.ts`. Run `pnpm test:e2e -- test/docs` and confirm that every remaining discrepancy test, the contract completeness tests and the sample tests are green.
- [X] T021 Run `pnpm docs:export` to regenerate `openapi.json`. Review `git diff openapi.json`. Expect changes only under `/api/reservations/all`: the `limit`/`offset` schema (minimum, maximum, default) and descriptions, the `old`/`validated` description, and nothing else. An unrelated change means something leaked; investigate it. Then run `pnpm build && pnpm docs:check`, which must be clean.
- [X] T022 [P] Update `specs/005-openapi-contract-export/discrepancies.md` § D11:
  - Add `- **Status**: Resolved by \`specs/006-fix-reservation-paging\` (2026-09-29); closes #16`.
  - Correct the "Principle" line: the default did **not** apply, and the list was unbounded (observed 2026-09-29, research R1).
  - Change "Evidence" to `test/reservations/reservation-paging.e2e-spec.ts`.
  - Add a note that the same root cause also made the default sort ascending (the contract said `desc`) and made `old=false` behave like `old=true`, both fixed by 006.

  Leave every other entry untouched.
- [X] T023 [P] Mark this spec's status as `Implemented` in `specs/006-fix-reservation-paging/spec.md`, and tick the completed boxes in this file as you go.
- [X] T024 Run all the gates and record the output: `pnpm lint:ci && pnpm test && pnpm test:e2e && pnpm build && pnpm docs:check && pnpm audit --audit-level high`. Confirm that coverage stays ≥ 80% overall and ≥ 90% for `src/auth`. If any gate fails, fix it; don't skip it.
- [X] T025 Walk through `specs/006-fix-reservation-paging/quickstart.md` § 2 against `pnpm db:setup && pnpm start:dev`. This includes the user's original `?sort=asc&limit=200&offset=0` call, now expected to return 400 naming the maximum of 50, and the same call with `limit=50`, which should return 200. Record the results in the PR.
- [X] T026 Confirm with the user before anything is pushed that the four new indexes will be built on Atlas automatically when the app connects (Mongoose `autoIndex` default). The collection is small, but this is a production-side effect, so the PR must mention it.
- [X] T027 Prepare the PR description (the user must approve before anything is pushed or opened). It needs:
  - `Closes #16`.
  - A summary of the root cause (R1).
  - The principles touched: I, II, IV and V.
  - Under **"Flagged for reviewer"**, the behaviour changes from research R7: a request without `limit` now returns at most 10 rows instead of all of them; a request without `sort` now returns newest first; `old=false` now works; `old`/`validated` values other than true/false are refused; `limit` above 50 is refused.
  - A note that the Flutter app's list screen should be checked for the order change.
  - The gate results from T024.

  End it with the attribution line from the session instructions. Commits follow the CLAUDE.md style (imperative summary, no prefix, a body explaining why), and the branch is checked before every commit.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none. T001 creates the file that T008, T013 and T017 extend.
- **Foundational (Phase 2)**: depends on T001 only for the full e2e run. **Blocks every story.** T003 must land no later than T005 (R4).
- **US1 (Phase 3)**: depends on Phase 2.
- **US2 (Phase 4)**: depends on Phase 2. Its paging cases also need T009 (US1), so run it after US1 in practice. The flag cases ((b)–(d)) only need Phase 2.
- **US3 (Phase 5)**: depends on T009 (US1) for the refusal rules, and on T003 for the flag refusals.
- **Polish (Phase 6)**: depends on all stories. T021 depends on T019. T024 depends on T020–T022. T027 depends on T024 and T025.

### Within Each Story

Write the tests and watch them fail, then implement and watch them pass. The DTO comes
before the service, which comes before the e2e run.

### Parallel Opportunities

- T002 ∥ T004 (different spec files).
- T006 ∥ T007 ∥ T008 (DTO spec, service spec, e2e file).
- T011 ∥ T009/T010 (entity file).
- T013 ∥ T014, and T016 ∥ T017.
- T022 ∥ T023 (docs files).

T008, T013 and T017 all edit the same e2e file. They are marked [P] relative to the *other*
files in their phase, but not relative to each other.

## Parallel Example: User Story 1

```text
Task: "T006 filter-list.dto.spec.ts: valid conversion and defaults"
Task: "T007 reservations.service.spec.ts: findAll limit/skip/sort with _id tie-break"
Task: "T008 reservation-paging.e2e-spec.ts: US1 cases (a)–(g)"
# then, after seeing all three fail:
Task: "T009 filter-list.dto.ts"   Task: "T011 reservation.entity.ts index"
Task: "T010 reservations.service.ts"
```

## Implementation Strategy

### MVP (User Story 1 only)

Phase 1 → Phase 2 → Phase 3. At this checkpoint bug #16 is fixed, the list is bounded, and
the order is stable. Even so, **don't ship it without Phase 6**: `openapi.json`,
`docs:check` and the D11 discrepancy test would disagree with the code, and CI would fail.

### Incremental Delivery

1. Setup and Foundational: conversion is safe.
2. US1 (MVP) → US2 → US3, each passing its own `describe` block.
3. Polish: contract, register, gates, manual check, then the PR (with approval).

## Notes

- Total: 28 tasks (T002b added by analysis remediation T1).

## Implementation notes (2026-09-29)

- T002b fails before the fix on the paging refusal (it needs `limit=50`), not on `old` alone:
  without a limit, the default page of 10 would hide the difference once fixed. The `old` defect
  itself was observed directly (research.md, observed table).
- T018: no change needed; class-validator's default `@Max` message already reads
  `limit must not be greater than 50`.
- T019: `@ApiQuery` does not accept top-level bounds, so `minimum`/`maximum`/`default` sit in its
  `schema`. The flag descriptions were added in T003 while editing that DTO.
- T024: all gates green. e2e 389/389, unit 199/199, docs:check up to date, audit has no
  high/critical advisories (4 low, 11 moderate, pre-existing). Overall line coverage is 78.9%,
  up from 77.84% on `main`; the constitution's 80% floor was already unmet before this change
  and is not enforced in CI (the Jest threshold covers `src/auth` only).
- T025: against the running dev server, the statuses match the contract (`limit=200` → 400
  "limit must not be greater than 50", `limit=50` → 200, `old=yes` → 400). The local database
  held no reservations, so row counts were verified only by the e2e suite.
- T027: the PR description is drafted; it is not opened until the user approves. Every story phase opens with failing tests, as Principle I requires.
- Out of scope, and don't touch: `src/filter_dto/pagination-query.dto.ts` (issues #7/#11),
  the global `ValidationPipe` options in `src/bootstrap.ts`, and the `old`/`dateTo` clash.
- `CLAUDE.md` references `specs/README.md` as the product state, but that file does not
  exist. This is flagged to the user; no task creates it.

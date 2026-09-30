---

description: "Task list for 007-fix-list-paging-defaults"
---

# Tasks: Optional, Bounded Paging on the Account, Item and Lock Lists

**Input**: Design documents from `specs/007-fix-list-paging-defaults/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/list-paging.md, quickstart.md

**Tests**: Required. Constitution Principle I is test-first and non-negotiable, and a bug fix
needs a regression test that fails first. Every test task MUST be run and **seen failing for
the reason stated** before its implementation task begins.

**Organization**: Each user story adds exactly the rules it needs, so each one's tests fail
first and pass after its own change:

- **US1** (P1): the values become optional with their defaults.
- **US2** (P2): a stable order.
- **US3** (P3): the ranges and the maximum. The move of the reservation list onto the shared
  DTO happens at the end of US3, once `PaginationQueryDto` carries the full 006 rule set,
  so the 006 suite never goes red.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, US3

## Ground rules for every task

- Run commands through `zsh -ic '…'`. To run one e2e file:
  `pnpm test:e2e -- test/docs/pagination-query.e2e-spec.ts` (≈ 2 min on `/mnt/c`). A plain
  DTO spec needs `import 'reflect-metadata';` as its first line (lesson from 006).
- No `any`. Match the surrounding style: block comments that explain *why*, and the
  `createTestApp` / `seedAccounts` / `tokenFor` helpers.
- Test data MUST be synthetic. Don't touch `/api/reservations/all` behaviour; 006's
  `test/reservations/reservation-paging.e2e-spec.ts` must stay green throughout.

---

## Phase 1: Setup (shared e2e fixture)

- [X] T001 Rewrite `test/docs/pagination-query.e2e-spec.ts` as the 007 regression suite. Keep the file name, because it already pins these routes. Replace the header comment: it now proves D1 fixed and the paging rules shared by all lists (specs/007-fix-list-paging-defaults), where it used to say it pins D4 and D1. `beforeAll`:
  - `createTestApp({ transport: true })`.
  - Clear the `Item`, `Lock` and `User` collections through their models (`getModelToken(Item.name)`, `Lock.name`, `User.name`). The mongod is shared across suites.
  - `seedAccounts` gives 2 users. Take an **admin** token.
  - Insert through the models exactly **15** items (`label: 'item-00'…'item-14'`, `status: true`, `description: 'd'`, `category: 'c'`), **15** locks (check the required fields in `src/locks/entities/lock.entity.ts`, synthetic values), and **13** more users (`email: 'u00@test.local'…`, `name`, `role: 'authenticated'`, `password`: any fixed bcrypt-looking string; it is never used to sign in), so every list has 15 records.
  - Record each list's seeded ids **in insertion order**.

  Add a helper `get(route, query)` that sets the bearer header, and `ROUTES = ['/api/users/all', '/api/items/all', '/api/locks/all']`. Add one smoke case: `limit=10&offset=0` → 200 on every route (green today).

**Checkpoint**: the file runs green with the smoke case only.

---

## Phase 2: User Story 1 - List without supplying paging values (Priority: P1) 🎯 MVP

**Goal**: `limit` and `offset` are optional, with defaults 10 and 0 (FR-001), and the contract
says so (FR-007).

**Independent Test**: With 15 records per list, `GET` each list with no query → 200 and 10
records. `offset=10` alone → 5, and `limit=5` alone → 5.

### Tests for User Story 1 ⚠️

- [X] T002 [P] [US1] Create `src/filter_dto/pagination-query.dto.spec.ts`. Import from `./pagination-query.dto` and convert with `plainToInstance(PaginationQueryDto, q, { enableImplicitConversion: true })` + `validateSync`. Assert:
  - `{}` → `{ limit: 10, offset: 0 }` with no errors.
  - `{ limit: '5' }` → `{ limit: 5, offset: 0 }`.
  - `{ offset: '10' }` → `{ limit: 10, offset: 10 }`.
  - `{ limit: '5', offset: '0' }` → the numbers 5 and 0.

  **Expect failure**: `{}` reports `limit` and `offset` errors, and there are no defaults (R1).
- [X] T003 [P] [US1] In `test/docs/pagination-query.e2e-spec.ts`, add `describe('US1: optional paging values')` with `describe.each(ROUTES)`:
  - (a) no query → 200 and **10** records. Assert the count only; order belongs to US2 (analysis A1).
  - (b) `offset=10` → 200 and 5.
  - (c) `limit=5` → 200 and 5.
  - (d) `offset=0` → 200 and 10.

  **Expect failure**: 400 `limit must be an integer number` (research table).

### Implementation for User Story 1

- [X] T004 [US1] In `src/filter_dto/pagination-query.dto.ts`, make both values optional with defaults:
  - `@IsOptional() @Type(() => Number) @IsInt()` with `limit: number = 10` and `offset: number = 0`. Keep the TypeScript types non-optional; the defaults guarantee a value.
  - Add `@ApiPropertyOptional({ type: 'integer', default: 10, description: 'Page size. Defaults to 10.' })` and `@ApiPropertyOptional({ type: 'integer', default: 0, description: 'Records to skip. Defaults to 0.' })` (R3: without it the plugin marks both values required).
  - Rewrite the class comment: optional with defaults, D1 resolved by 007.
  - Do **not** add range rules yet; those come in US3.

  T002 and T003 must pass.

**Checkpoint**: Issue #7 is fixed. Every list answers without paging values.

---

## Phase 3: User Story 2 - Page through a whole list reliably (Priority: P2)

**Goal**: A fixed order by `_id` (oldest first), so pages never repeat or skip records
(FR-004, SC-003).

**Independent Test**: Pages of 5 at 0, 5 and 10 on each list return 15 distinct ids equal to
the seeded ids in order, and `offset=20` returns `[]`.

### Tests for User Story 2 ⚠️

- [X] T005 [P] [US2] In `src/items/items.service.spec.ts` and `src/locks/locks.service.spec.ts`, add `describe('findAll')`. Provide the model as `{ find: jest.fn() }`, returning a chainable stub whose `limit`, `skip` and `sort` are `jest.fn()`s returning the stub. Assert that `findAll(5, 10)` calls `limit(5)`, `skip(10)` and `sort({ _id: 1 })`. **Expect failure**: no `sort` call. Keep the existing tests.
- [X] T006 [P] [US2] In `src/users/users.service.spec.ts`, add `describe('findAll')` with the same chain plus `exec: jest.fn().mockResolvedValue([doc()])`, reusing the file's `doc()` helper. Assert:
  - `limit(5)`, `skip(10)` and `sort({ _id: 1 })` are called.
  - The result items have **no** `password` (the projection is unchanged).

  **Expect failure**: no `sort`.
- [X] T007 [P] [US2] In `test/docs/pagination-query.e2e-spec.ts`, add `describe('US2: stable pages')` with `describe.each(ROUTES)`:
  - (a) `limit=5` at offsets 0, 5 and 10 → 5/5/5. The concatenated ids equal the seeded ids **in insertion order**.
  - (b) `offset=20` → `[]`.
  - (c) for `/api/users/all`, no returned record has a `password` field.

  (a) may already pass by natural order. That's acceptable (the unit tests T005 and T006 prove the sort), but record which happened.

### Implementation for User Story 2

- [X] T008 [US2] Add `.sort({ _id: 1 })` to `findAll` in `src/items/items.service.ts`, `src/locks/locks.service.ts` and `src/users/users.service.ts` (before `.exec()` in users). Add a one-line comment that `_id` gives a fixed order so pages never repeat or skip, and that `_id` is always indexed (Principle V; research R5). T005–T007 must pass.

**Checkpoint**: US1 and US2 pass.

---

## Phase 4: User Story 3 - Invalid paging values are refused clearly (Priority: P3)

**Goal**: `limit` 1–50 and `offset` ≥ 0. Anything else is a 400 naming the field, never an
unbounded list or a 500 (FR-002, FR-003). Then all four lists share one definition (FR-005).

**Independent Test**: On each list, `limit=0`, `limit=-5`, `limit=1000` and `offset=-1` → 400
naming the field. `limit=50` → 200.

### Tests for User Story 3 ⚠️

- [X] T009 [P] [US3] Extend `src/filter_dto/pagination-query.dto.spec.ts` by porting every case from `src/filter_dto/filter-list.dto.spec.ts`: the valid values `'1'`, `'50'`, `'010'`; every refusal, including `'51'`, `'200'`, `''` and arrays for `limit`, and `'-1'`, `'2.5'`, `'abc'` and arrays for `offset`; and "names the maximum". Add `'0'`, `'-5'` and `'1000'` for `limit`, `{ offset: '' }` → 0 with no error (U1). Import `MAX_PAGE_SIZE` from `./pagination-query.dto` and assert it equals 50. **Expect failure**: `MAX_PAGE_SIZE` isn't exported there, and 0, negative and large values are accepted.
- [X] T010 [P] [US3] In `test/docs/pagination-query.e2e-spec.ts`, add `describe('US3: refusals')` with `describe.each(ROUTES)`:
  - (a) `it.each` over `limit=0`, `limit=-5`, `limit=2.5`, `limit=abc`, `limit=`, `limit=51`, `limit=1000`, `limit=5&limit=7` → 400, with some message containing `limit`.
  - (b) `limit=1000` → a message containing `50`.
  - (c) `offset=-1`, `offset=abc`, `offset=2.5`, `offset=0&offset=5` → **400** (not 500), with a message containing `offset` (analysis U2). `offset=99999999999999999999` → 200 and `[]`: observed on 2026-09-30, the database accepts it, so there's no 500 and no bound is needed (analysis G1 disproved).
  - (c2) `offset=` → 200: an empty starting position counts as 0 (spec edge case, analysis U1).
  - (d) `limit=50` → 200 and 15 records.
  - (e) no token → 401.

  **Expect failure**: `limit=0` returns every record with 200, and `offset=-1` is a 500 (research table).

### Implementation for User Story 3

- [X] T011 [US3] In `src/filter_dto/pagination-query.dto.ts`:
  - Move `MAX_PAGE_SIZE = 50` here, with its comment citing Principle V and 006 FR-005.
  - Add `@Min(1) @Max(MAX_PAGE_SIZE)` to `limit` and `@Min(0)` to `offset`. No `offset` maximum: the huge-offset case answers 200 with `[]` (G1 disproved).
  - Extend the two `@ApiPropertyOptional`s with `minimum: 1, maximum: MAX_PAGE_SIZE` and `minimum: 0`, and descriptions like "Page size, 1–50. Defaults to 10. A larger value is refused with 400."

  T009 and T010 must pass.
- [X] T012 [US3] Consolidate onto one definition (R2):
  - `src/filter_dto/filter-reservation.dto.ts` extends `PaginationQueryDto` instead of `FilterListDto`.
  - Change the `MAX_PAGE_SIZE` import in `src/reservations/reservations.controller.ts` to `../filter_dto/pagination-query.dto`.
  - Delete `src/filter_dto/filter-list.dto.ts` and `src/filter_dto/filter-list.dto.spec.ts`, since their cases now live in T009.
  - Run `pnpm test` and `pnpm test:e2e -- test/reservations`. The 006 suite must be fully green, unchanged.

**Checkpoint**: All three stories pass, and the reservation list is unchanged.

---

## Phase 5: Polish, Contract and Register

- [X] T013 [P] Update comments:
  - In `src/items/items.controller.ts`, `src/locks/locks.controller.ts` and `src/users/users.controller.ts`, replace `// Typed binding (discrepancy D4). Both values stay required, as they were (D1).` with a comment that paging is optional and bounded by `PaginationQueryDto` (D1 fixed by 007). Add `whitelist: true` to each route pipe, matching the reservation list; it only strips undeclared keys, which the services never read (analysis I1).
  - In the header comments of `src/items/items.controller.spec.ts` and `src/locks/locks.controller.spec.ts`, keep the D4 mention accurate.
  - In `src/reservations/reservations.controller.ts`, correct the comment "Inherited from FilterListDto, which Swagger does not expand from the parent class". The plugin does expand inherited properties (research R3); the explicit `@ApiQuery` blocks remain for their descriptions. Don't change those blocks.
- [X] T014 In `test/docs/contract-discrepancies.e2e-spec.ts`, delete `it('D1: …')` and add D1 to the header's "Not here" list (fixed by 007, pinned by `test/docs/pagination-query.e2e-spec.ts`). Run `pnpm test:e2e -- test/docs`, which must be green.
- [X] T015 Run `pnpm docs:export` and review `git diff openapi.json`:
  - Only `/api/users/all`, `/api/items/all` and `/api/locks/all` should change: `required: false`, `type: integer`, the bounds, defaults and descriptions.
  - **No change** under `/api/reservations/all`, and nowhere else.

  Investigate any other difference. Then run `pnpm build && pnpm docs:check`, which must be clean.
- [X] T016 [P] Update `specs/005-openapi-contract-export/discrepancies.md` § D1:
  - Add `**Status**: Resolved by \`specs/007-fix-list-paging-defaults\` (2026-09-29); closes #7`.
  - Change Evidence to `test/docs/pagination-query.e2e-spec.ts`.
  - Add an "Also found" line: `limit=0` was unbounded, a negative `limit` was reinterpreted, there was no maximum, and `offset=-1` was a 500, all fixed by 007.

  Change the Principle line to V (a hard maximum was missing). Leave the other entries alone.
- [X] T017 [P] Set `**Status**: Implemented` in `specs/007-fix-list-paging-defaults/spec.md`, and tick the tasks here as you go.
- [X] T018 Run all gates and record the results:
  - `pnpm lint:ci && pnpm test:cov && pnpm test:e2e && pnpm build && pnpm docs:check && pnpm audit --audit-level high`
  - Measure `main` again for the coverage baseline (analysis F1). Coverage must not drop below it, and `src/auth` must stay ≥ 90%.
  - Fix any failure; don't skip it.
- [X] T019 Walk through `quickstart.md` § 2 against the running dev server using read-only GETs. Don't seed the user's dev database. Record the statuses.
- [X] T020 Draft the PR description; opening it needs the user's approval. It needs:
  - `Closes #7`, the root cause (R1), and the principles touched (I, II, IV, V).
  - **Flagged for reviewer** (R6): `limit=0`, a negative `limit` and `limit` > 50 now get a 400 instead of a 200. The account, item and lock lists now come back oldest first by id, which is guaranteed rather than incidental. The Flutter app must page if it loads more than 50 items or locks at once.
  - The gate results.
  - The attribution line.

  Commit in the CLAUDE.md style, checking the branch before each commit.

---

## Dependencies & Execution Order

- **Setup (T001)** blocks the e2e test tasks T003, T007 and T010, which all edit the same file and therefore run one after another.
- **US1 (T002–T004)** comes first. US2 needs lists that answer without values only for convenience; its tests pass explicit values.
- **US2 (T005–T008)** is independent of US3.
- **US3 (T009–T012)**: T011 depends on T004 (same file). T012 depends on T011, because the reservation list needs the full rule set before it moves over.
- **Polish (T013–T020)** depends on all stories. T015 depends on T012 and T013. T018 depends on T014–T016. T020 depends on T018 and T019.

### Parallel Opportunities

- T002 ∥ T003 (DTO spec ∥ e2e file).
- T005 ∥ T006 ∥ T007 (three spec files).
- T009 ∥ T010.
- T013 ∥ T016 ∥ T017.

## Parallel Example: User Story 2

```text
Task: "T005 items/locks service findAll sort tests"
Task: "T006 users service findAll sort + no password"
Task: "T007 e2e stable pages on all three routes"
# after seeing them fail:
Task: "T008 .sort({ _id: 1 }) in the three services"
```

## Implementation Strategy

- **MVP**: Phase 1 and US1 fix issue #7 itself. Don't ship at that point, though. Without US3,
  `limit=0` is still unbounded, and without Phase 5, `docs:check` and the D1 test fail in CI.
- **Incremental**: US1 → US2 → US3 → Polish, each ending on a green checkpoint.

## Notes

- Total: 20 tasks. Every story opens with tests that fail first.

## Implementation notes (2026-09-30)

- Red first: the DTO spec failed on missing defaults, then on the missing `MAX_PAGE_SIZE`
  export. The service specs failed on the missing `sort`. The e2e suite had 46 of 73
  tests failing before the fix.
- T007: the e2e stable-pages test passed before the fix, because natural order matched
  insertion order, as the task allowed. The unit tests T005 and T006 are the ones that
  proved the sort.
- Analysis G1 was disproved by running it: `offset=99999999999999999999` answers 200 with
  `[]`, not 500. The test pins that, and no `offset` maximum was added.
- T015: `openapi.json` changes semantically only on the three routes. Under
  `/api/reservations/all`, `limit`/`offset` now appear first (inherited from the DTO) with
  identical content, which is a reorder only.
- T018: lint, unit 208/208, e2e 440/440, build, docs:check and audit (no high/critical;
  4 low, 11 moderate, pre-existing) all passed. Line coverage is 79.48%, up from 78.9% on
  `main`. The 80% floor was already unmet before this change.
- T019: the dev server wasn't running, so the built app was started against the local
  Docker Mongo for read-only GETs and then stopped. `limit=1000` → 400 "limit must not be
  greater than 50", `offset=-1` → 400 (was 500), `limit=0` → 400, and no values → 200.
- Out of scope, and not to be touched: reservation list behaviour, the global pipe options
  (D5), and the lists with no paging at all (#11 / D6).

---

description: "Task list for 011-fix-unbounded-lists"
---

# Tasks: Bounded Paging on the Activity, Activity Type and Configuration Lists

**Input**: Design documents from `specs/011-fix-unbounded-lists/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/list-paging.md,
quickstart.md

**Tests**: Required. Constitution Principle I is test-first and non-negotiable, and a bug fix
needs a regression test that fails first. Every test task MUST be run and **seen failing for
the reason stated** before its implementation task begins.

**Organization**:

- The refusals (US3) come from the shared `PaginationQueryDto` as soon as US1 binds it. So
  every e2e regression case, for all three stories, is written in Phase 2 and seen failing
  **before any source change**.
- Each story phase then adds its unit tests and the change that turns its e2e block green:
  - **US1** (P1): the lists are bounded. The query is bound and converted, and the services
    apply `limit`/`offset`.
  - **US2** (P2): a fixed order, plus the activity indexes.
  - **US3** (P3): the contract documents the refusals, and the cases are confirmed green.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, US3

## Ground rules for every task

- Run commands through `zsh -ic '…'`. To run one e2e file, use
  `pnpm test:e2e test/activity/activity-paging.e2e-spec.ts`. Don't use `--`: pnpm 12 passes it
  through literally. Expect about 3 minutes on `/mnt/c`.
- No `any`. Match the surrounding style: block comments that explain *why*, the
  `createTestApp({ transport: true })` / `seedAccounts` / `tokenFor` helpers, and the
  chainable model stubs already used in each service spec.
- Test data MUST be synthetic. The in-memory mongod is shared by the whole e2e run, so a
  suite that counts records clears its collections first.
- Behaviour of the four lists already fixed (006, 007) and the by-id routes (008) MUST NOT
  change: their suites stay green throughout.

---

## Phase 1: Setup (fixtures)

- [X] T001 Extend the fixture in `test/docs/pagination-query.e2e-spec.ts`:
  - Add `/api/activity-type` and `/api/config` to `ROUTES`.
  - In `beforeAll`, also clear the `ActivityType` and `Config` collections through their models (`getModelToken(ActivityType.name)`, `Config.name`).
  - Insert exactly **15** of each: activity types `{ name: 'type-00'…'type-14', budget: i }`, and configurations `{ doorLock: 'door-00'…, mainLock: 'main-00'…, usersLimit: 20 }`.
  - Record their ids in insertion order in `seeded[route]`.
  - Rewrite the header comment: the suite covers every list paged by position and read oldest first. It covers accounts, items and locks (007) and activity types and configurations (011, issue #11 / D6).
  - The admin token already passes the activity type route's role check. Also keep the **guest** token from `seedAccounts`. Add one case: `/api/activity-type?limit=0` with the guest token → **403**, not 400, because permission is checked before the paging values (spec edge case; analysis C1). It is green today and must stay green.

  The file's existing smoke case (`limit=10&offset=0` → 200 and 10) will **fail** for the two new routes, because they answer 15. That is the first red.
- [X] T002 [P] Create `test/activity/activity-paging.e2e-spec.ts`, describe `'Activity list paging (011)'`. `beforeAll`:
  - `createTestApp({ transport: true })`, then clear the `Activity` and `ActivityType` collections. `seedAccounts`: keep **both** tokens, admin and guest (the route admits both).
  - Insert 3 activity types (`A`, `B`, `C`).
  - Insert **15** activities **one by one, in this order**, so `_id` grows with `i`:
    - `date`: day `1 + (i % 5)` of January 2026 (5 dates × 3 activities each, so every date has a tie).
    - `type`: types `[A, B, C][i % 3]`.
    - `status`: `TODO` for `i < 8`, `COMPLETED` otherwise (8 TODO, 7 COMPLETED).
    - `price`: `0` for `i % 4 === 0`, else `1`.
  - Compute `expected`: the seeded records sorted by `date` desc, then `_id` desc, as id strings. That is the order the spec requires (research R4). Insertion order inside a date is `_id` **ascending**, so natural order cannot satisfy it by accident.

  Add a `get(query, token = admin)` helper and a header comment citing issue #11 / D6, the observed behaviour (research table), and the D11-style root cause (R1).

**Checkpoint**: both files compile. T001's smoke case is red on the two new routes.

---

## Phase 2: Foundational (red regression cases for all stories)

**⚠️ CRITICAL**: no source file changes until every task here has been run and seen failing.

- [X] T003 Run `test/docs/pagination-query.e2e-spec.ts`. There is nothing to add: the existing `US1`, `US2` and `US3` blocks now run against the two new routes via `ROUTES`. Run the file and record the failures. **Expected**:
  - US1: 15 records instead of 10, 5 or 10.
  - US2: pages of "5" hold 15. The order may already pass.
  - US3: 200 where 400 is expected.
  - The 007 routes stay green.
- [X] T004 [P] In `test/activity/activity-paging.e2e-spec.ts`, add `describe('US1: bounded')`:
  - (a) no query → 200 and **10**.
  - (b) `limit=5` → 5.
  - (c) `offset=10` → 5.
  - (d) the guest token, no query → 200 and 10.
  - (e) every returned activity's `type` is an object with a `name`: still populated (FR-007).

  **Expect failure**: 15 records (research table).
- [X] T005 [P] In the same file, add `describe('US2: stable pages')`:
  - (a) no query → ids equal `expected.slice(0, 10)`.
  - (b) `limit=5` at offsets 0, 5 and 10 → concatenated ids equal `expected`.
  - (c) `offset=20` → `[]`.
  - (d) `status=TODO&limit=5` → 5, then `&offset=5` → 3, together the 8 TODO ids in `expected` order.
  - (e) `type=<A id>&limit=3` → 3, then `&offset=3` → 2, all with type A.
  - (f) `price=1&limit=50` → the 11 price-1 activities in `expected` order.

  **Expect failure**: ties come back `_id` ascending, and paging values are ignored.
- [X] T006 [P] In the same file, add `describe('US3: refusals')`:
  - (a) `it.each` over `limit=0`, `limit=-5`, `limit=2.5`, `limit=abc`, `limit=`, `limit=51`, `limit=1000`, `limit=5&limit=7` → 400, with a message containing `limit`.
  - (b) `limit=1000` → a message containing `50`.
  - (c) `offset=-1`, `offset=abc`, `offset=2.5` → 400 naming `offset`.
  - (d) `offset=` → 200 and 10.
  - (e) `limit=50` → 200 and 15.
  - (f) `status=bogus&limit=5` → 400 with the existing status message (filters are still validated).
  - (g) no token → 401.

  **Expect failure**: 200 with 15 for (a) to (c) (research table).
- [X] T007 [P] Create `src/activity/entities/activity.entity.spec.ts`, mirroring `src/reservations/entities/reservation.entity.spec.ts`. Assert that `ActivitySchema.indexes()` contains `{ date: -1, _id: -1 }`, `{ type: 1 }`, `{ status: 1 }` and `{ price: 1 }`. Cite Principle V and research R5. **Expect failure**: no indexes declared.

**Checkpoint**: every case above has been run, and its failure reason has been recorded in the Implementation notes at the end of this file.

---

## Phase 3: User Story 1 - Lists never return an unbounded number of records (Priority: P1) 🎯 MVP

**Goal**: Each list returns at most one page: 10 by default, 50 at most (FR-001, FR-002), and
paging applies after the activity filters (FR-006).

**Independent Test**: T004, and the US1 block of T003, pass.

### Unit tests for User Story 1 ⚠️

- [X] T008 [P] [US1] In `src/activity-type/activity-type.service.spec.ts` and `src/config/config.service.spec.ts`, add `describe('findAll')`:
  - Give the model a `find` that returns a chainable stub, where `sort`, `skip` and `limit` are `jest.fn()`s returning the stub and `exec` resolves `[record]`.
  - Assert `findAll(5, 10)` calls `skip(10)` and `limit(5)` and resolves `[record]`.
  - Config's model stub currently has only `findByIdAndUpdate`, so add `find`.

  **Expect failure**: `findAll` takes no arguments and calls neither `skip` nor `limit`.
- [X] T009 [P] [US1] In `src/activity/activity.service.spec.ts`, add `describe('findAll')` with a `find` stub chain (`sort`, `skip`, `limit`, `populate` and `exec`):
  - (a) `findAll({ limit: 5, offset: 10 })` calls `find({})`, `skip(10)`, `limit(5)` and `populate('type')`.
  - (b) with `type`, `status` and `price` set, `find` receives exactly those three keys. `limit` and `offset` are **not** in the filter.

  Build the input as a `FilterActivityDto` via `Object.assign(new FilterActivityDto(), {...})` so the defaults apply. **Expect failure**: no `skip`/`limit`.
- [X] T010 [P] [US1] Controller binding specs:
  - `src/activity-type/activity-type.controller.spec.ts` and `src/config/config.controller.spec.ts`: `findAll({ limit: 5, offset: 10 })` calls the service with `(5, 10)`. Config replaces `toHaveBeenCalledWith()`.
  - `src/activity/activity.controller.spec.ts`: keep "forwards its input" (the whole DTO).

  **Expect failure**: a TypeScript error or the wrong call, because `findAll` takes no query.

### Implementation for User Story 1

- [X] T011 [US1] Update `src/activity/dto/filter-activity.dto.ts`:
  - `export class FilterActivityDto extends PaginationQueryDto` (import from `../../filter_dto/pagination-query.dto`).
  - Add a class comment: paging rules shared with every list (011, R2). The handler only sees the defaults through the route pipe (R1, R3).
- [X] T012 [US1] Controllers (R3). On each `findAll`, bind `@Query(new ValidationPipe({ transform: true, whitelist: true }))`, with a comment that the global pipe passes the raw query, so defaults would never reach the handler (D11, 006 R1), and citing D6 fixed by 011:
  - `src/activity/activity.controller.ts`: on `filterActivityDto: FilterActivityDto`.
  - `src/activity-type/activity-type.controller.ts`: `query: PaginationQueryDto`, calling `findAll(query.limit, query.offset)`.
  - `src/config/config.controller.ts`: the same.

  Import `ValidationPipe` and `Query` where missing.
- [X] T013 [US1] Services:
  - `src/activity-type/activity-type.service.ts`: `findAll(limit: number, offset: number)` → `find().skip(offset).limit(limit).exec()`.
  - `src/config/config.service.ts`: the same. Delete the dead `if (!conf) throw NotFoundException` (it tested an unawaited query; R6), and drop `NotFoundException` from the imports only if unused.
  - `src/activity/activity.service.ts`: replace `const query: any` with `const query: FilterQuery<Activity> = {}` (from `mongoose`), and add `.skip(filter.offset).limit(filter.limit)` before `.populate('type')`.

  T008–T010, T004 and the US1 block of T003 must pass.

**Checkpoint**: Issue #11's core defect is fixed: no list returns more than one page.

---

## Phase 4: User Story 2 - Page through a whole list reliably (Priority: P2)

**Goal**: A total, fixed order on every list (FR-005), with every activity sort and filter
field indexed (Principle V).

**Independent Test**: T005, the US2 block of T003, and T007 pass.

### Unit tests for User Story 2 ⚠️

- [X] T014 [P] [US2] Extend the `findAll` tests from T008: assert `sort({ _id: 1 })`. Extend the T009 tests: assert `sort({ date: -1, _id: -1 })`. **Expect failure**: no sort on activity types and configurations, and `{ date: -1 }` only on activities.

### Implementation for User Story 2

- [X] T015 [US2] Add the sorts, each with a one-line comment that the order is total, so pages never repeat or skip, citing research R4:
  - `.sort({ _id: 1 })` in `ActivityTypeService.findAll` and `ConfigService.findAll` (`_id` is always indexed).
  - `.sort({ date: -1, _id: -1 })` in `ActivityService.findAll`.
- [X] T016 [US2] In `src/activity/entities/activity.entity.ts`, after `SchemaFactory.createForClass`, declare `ActivitySchema.index({ date: -1, _id: -1 })`, `{ type: 1 }`, `{ status: 1 }` and `{ price: 1 }`. Add a comment worded like the reservation schema's (Principle V; 011 research R5).

  T005, T007 and T014 must pass.

**Checkpoint**: US1 and US2 pass.

---

## Phase 5: User Story 3 - Invalid paging values are refused clearly (Priority: P3)

**Goal**: The refusals are proven on all three lists (FR-003, FR-004), and the contract
documents them (FR-009).

**Independent Test**: T006 and the US3 block of T003 pass. `openapi.json` documents 400 on
activity types and configurations.

- [X] T017 [US3] Run T006 and the US3 block of `test/docs/pagination-query.e2e-spec.ts`. They should already pass from T012. If any case fails, fix the binding, not the test.
- [X] T018 [US3] Swagger metadata:
  - `src/activity-type/activity-type.controller.ts` `findAll`: `@ApiRefusals(400, 401, 403)`.
  - `src/config/config.controller.ts` `findAll`: `@ApiRefusals(400, 401)`.
  - Rewrite the three `@ApiOkResponse` descriptions to drop "unpaginated (discrepancy D6)":
    - activities: "One page of matching activities, newest first (ties: newest created first)."
    - activity types and configurations: "One page of … , oldest first."

**Checkpoint**: All three stories pass.

---

## Phase 6: Polish, Contract and Register

- [X] T019 In `test/docs/contract-discrepancies.e2e-spec.ts`, delete `it('D6: …')`. In the header's "Not here" list, add D6, fixed by `specs/011-fix-unbounded-lists` and pinned by `test/docs/pagination-query.e2e-spec.ts` and `test/activity/activity-paging.e2e-spec.ts`.
- [X] T020 R8 check: run `GET /api/activity?price=0` against the T002 fixture (temporarily, in `activity-paging.e2e-spec.ts`):
  - **If it returns all 15** (the `price=0` filter is ignored): move the case to `test/docs/contract-discrepancies.e2e-spec.ts` as `it('D17: filtering activities by a price of 0 is ignored', …)`, pinning 200 with every activity, and record D17 in T022. **Don't** fix it, and don't open an issue without the owner's approval.
  - If it returns only the price-0 activities, drop the case and note it here.
- [X] T021 Run `pnpm docs:export` and review `git diff openapi.json`:
  - Only `GET /api/activity`, `GET /api/activity-type` and `GET /api/config` should change: the `limit`/`offset` parameters (optional, integer, bounds, defaults), the new 400 on the latter two, and the descriptions.
  - Investigate any other difference.

  Then run `pnpm build && pnpm docs:check`, which must be clean. Run `test/docs` in full: the completeness checks 1–5 must stay green.
- [X] T022 [P] Update `specs/005-openapi-contract-export/discrepancies.md` § D6:
  - Add `**Status**: Resolved by \`specs/011-fix-unbounded-lists\` (2026-10-01); closes #11`.
  - Change Evidence to the two suites.
  - Add an "Also found" line (observed 2026-10-01): `limit`/`offset` were silently ignored rather than refused, and activities sharing a date had no fixed order. Both are fixed here, and the activity sort and filter fields are now indexed.
  - Add D17 if T020 confirmed it, with Issue "none yet".
- [X] T023 [P] Set `**Status**: Implemented` in `specs/011-fix-unbounded-lists/spec.md`, and tick the tasks here as you go.
- [ ] T024 Commit the work in the CLAUDE.md style (check the branch first) so the tree is clean (analysis F1). Then run all the gates on the committed HEAD with `VERIFY_E2E=1 pnpm verify` (it needs a clean tree), and record the results.
  - Coverage must not drop below `main` (007 recorded 79.48%, already under the 80% floor before this work), and `src/auth` must stay ≥ 90%.
  - Fix any failure; don't skip it.
- [ ] T025 Walk through `quickstart.md` § 2 against a running app on the local Docker Mongo, with read-only GETs only. Record the statuses.
- [ ] T026 Draft the PR description; opening it needs the user's approval. It needs:
  - `Closes #11`, the root causes (R1), and the principles touched (I, II, IV, V).
  - **Flagged for reviewer** (R7):
    - Lists over 10 records now return one page.
    - Invalid `limit`/`offset` are now refused rather than ignored.
    - The Flutter app must page if it loads more than 10 activities, activity types or configurations without paging values.
  - The four new activity indexes, built at connection time.
  - The `verify` and e2e results, and the attribution line.

  If `main` has moved (features 009 and 010 touch the same services, `openapi.json` and the register; analysis I1 and I2), rebase, regenerate `openapi.json` rather than merging it by hand, and re-run the gates.

---

## Dependencies & Execution Order

- **Setup (T001, T002)** comes first. T001 ∥ T002 (different files).
- **Foundational (T003–T007)** depends on Setup, and blocks every source change. T004–T006
  edit the same file, so they run one after another. T007 ∥ them.
- **US1 (T008–T013)**: tests T008 ∥ T009 ∥ T010, then T011 → T012 → T013.
- **US2 (T014–T016)** depends on T013, because it touches the same `findAll` methods.
  T016 ∥ T015.
- **US3 (T017–T018)** depends on T012. T018 can run alongside US2.
- **Polish**:
  - T019 ∥ T020.
  - T021 depends on T018 and T013.
  - T022 depends on T020.
  - T024 depends on everything before it.
  - T026 depends on T024 and T025.

### Parallel Opportunities

- T001 ∥ T002.
- T007 ∥ T004–T006.
- T008 ∥ T009 ∥ T010.
- T015 ∥ T016.
- T022 ∥ T023.

## Parallel Example: User Story 1

```text
Task: "T008 activity-type/config service findAll skip/limit tests"
Task: "T009 activity service findAll filter + skip/limit tests"
Task: "T010 controller binding tests"
# after seeing them fail:
Task: "T011 FilterActivityDto extends PaginationQueryDto"
Task: "T012 route pipes + bound queries"
Task: "T013 services apply skip/limit"
```

## Implementation Strategy

- **MVP**: Phases 1–3 fix issue #11's core defect. Don't ship at that point, though: without
  US2, same-date activities can repeat across pages, and without Phase 6, `docs:check` and
  the D6 pin fail.
- **Incremental**: US1 → US2 → US3 → Polish, each ending on a green checkpoint.

## Notes

- Total: 26 tasks. Every story's behaviour is pinned by a failing test before its change.

## Implementation notes

### Implementation notes (2026-10-01)

- **Red first** (T003–T010, before any source change):
  - `pagination-query.e2e-spec.ts`: the 007 routes and the guest-403 case stayed green (78
    passed). All 44 cases on `/api/activity-type` and `/api/config` failed: 15 records where a
    page was expected, and 200 where 400 was expected.
  - `activity-paging.e2e-spec.ts`: 23 of 27 failed. The ties came back `_id` ascending, and
    paging values were ignored. Passing already: `limit=50` (15), `status=bogus` → 400, no
    token → 401, and the populated type.
  - Unit tests: TypeScript errors (`findAll` took no paging arguments, and
    `FilterActivityDto` had no `limit`), no converting query pipe, no indexes. Then, for US2,
    no `sort` on activity types and configurations, and `{ date: -1 }` only on activities.
- **Regression caught by the e2e suite** (T017): once the route pipe passed the converted DTO
  through, `price=1` was refused with 400. `price` (`@IsNumber`) had only ever been converted
  by the global pipe's implicit conversion, on a copy it validates and discards. A controller
  test reproduced it, and `@Type(() => Number)` on `price` fixed it.
- **R8 resolved differently than planned** (T020): `price=0` returned all 15 activities, but
  **this change caused it**. The raw string `'0'` used to be truthy; the converted number `0`
  is not. It was fixed in the service (compared with `undefined`) and pinned by a service test
  and an e2e test. It is not recorded as D17, because no released behaviour was wrong.
- **New test helper**: `queryPipes` in `src/common/testing/route-metadata.ts`. The controller
  specs use it to run the route's own query pipe: defaults, string conversion, and `price`.
- **T021**: `openapi.json` changes exactly `GET /api/activity`, `GET /api/activity-type` and
  `GET /api/config`: the `limit`/`offset` parameters, 400 on the latter two, and the
  descriptions. `components` is unchanged. `test/docs` is green: completeness 193, discrepancies
  8, sample 5, paging 122.
- **Lint and unit tests**: lint is clean. 285/285 unit tests pass. Line coverage across all
  files is 89.62%, and the three modules are at 89.65–96%.

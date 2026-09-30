---

description: "Task list for 008-fix-unknown-id-404"
---

# Tasks: Honest Answers for Unknown and Malformed Record Ids

**Input**: Design documents from `specs/008-fix-unknown-id-404/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/by-id-routes.md, quickstart.md

**Tests**: Required. Constitution Principle I is test-first and non-negotiable, and a bug fix
needs a regression test that fails first. Every test task MUST be run and **seen failing for
the reason stated** before its implementation task starts.

**Organization**:

- **US1** (P1, issue #8): unknown ids get 404. Fixed in the services.
- **US2** (P2, issue #12): malformed ids get 400. Fixed with a pipe at the HTTP edge.

The two stories are independent: US1 doesn't need the pipe, and US2 doesn't need the service
fixes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2

## Ground rules for every task

- Run commands through `zsh -ic '…'`. To run one e2e file:
  `pnpm test:e2e -- test/records/record-ids.e2e-spec.ts` (about 2 minutes on `/mnt/c`).
- No `any`. Match the surrounding style: block comments that explain *why*, and the
  `createTestApp` / `seedAccounts` / `tokenFor` helpers. A plain spec that uses
  class-transformer needs `import 'reflect-metadata';` first.
- Test data MUST be synthetic. The e2e mongod is shared, so seed through the models and don't
  rely on other suites' records.
- **Every service query MUST end in `.exec()` and be awaited**, so the unit tests can mock
  `{ exec: jest.fn().mockResolvedValue(...) }` in the same way everywhere. That includes
  `activity-type` and `activity.update`, which currently return bare queries.
- Out of scope, don't touch: D3 (projection), D8 (invalid bodies returning 500), D9 (user
  updates need every field), D10 (the device key's 404), and `users.update`'s 406 for a wrong
  current password.

---

## Phase 1: Setup (shared e2e fixture)

- [X] T001 Create `test/records/record-ids.e2e-spec.ts` with `describe('By-id operations (008)')`:
  - A header comment citing specs/008-fix-unknown-id-404, issues #8/#12 and D2/D7.
  - `beforeAll`: `createTestApp({ transport: true })`, `seedAccounts`, and tokens for the admin **and** the guest.
  - `const UNKNOWN = '6aba80d38c58c96b58020000'` and `const MALFORMED = 'abc'`.
  - An `OPS` table of all 20 operations, as `{ method, route, access: 'auth' | 'admin' | 'device', body? }`, in the order of `contracts/by-id-routes.md`.
  - Valid bodies, the ones the plan-phase probe proved pass validation:
    - users: `{ email: 'p@test.local', password: 'pw', name: 'n', role: 'authenticated', changePassword: false, currentPassword: 'x' }`
    - items: `{ label: 'l', status: true, description: 'd', category: 'c' }`
    - reservations: `{ dateIni: '2026-01-01', dateEnd: '2026-01-02', type: 'direct', validated: false, contact: 'c', quantity: 1 }`
    - locks: `{ lock: '1', userNumber: '2' }`
    - config PUT: `{ doorLock: '1', mainLock: '2', usersLimit: 3, analogLecture: 0 }`
    - config PATCH (device): `{ analogLecture: 1, apiKey: process.env.TANK_API_KEY, time: 1 }`
    - activity: `{ type: UNKNOWN, status: 'TODO', price: 1, date: '2026-01-01', description: 'd' }`
    - activity-type: `{ name: 'n', budget: 1 }`
  - A helper `call(op, id, token = adminToken)` that sends the body for PUT and PATCH.
  - One smoke case: `GET /api/users/<admin id>` → 200 (green today).

**Checkpoint**: The file runs green with only the smoke case.

---

## Phase 2: User Story 1 - Told when a record does not exist (Priority: P1) 🎯 MVP

**Goal**: A well-formed id that matches nothing gets **404** on all 20 operations
(FR-001, FR-003, FR-004, FR-006).

**Independent Test**: Every operation with `UNKNOWN` answers 404 with a message containing
`not found`. Deleting a real record twice answers 200, then 404.

### Tests for User Story 1 ⚠️

- [X] T002 [P] [US1] In `test/records/record-ids.e2e-spec.ts`, add `describe('US1: unknown id')`:
  - (a) `it.each(OPS)`: `UNKNOWN` → **404**, and `body.message` contains `not found`.
  - (b) `PUT /api/users/UNKNOWN` with `changePassword: true, currentPassword: 'x', password: 'new'` → **404** (research R5).
  - (c) A round trip per kind with a delete route (items, locks, reservations, activity-type, activity, users). Insert one record through its model (activity needs a seeded activity-type id), then:
    - `GET` → 200.
    - `PUT` with the kind's valid body → 200, returning the updated record (analysis G1: every `update` is rewritten).
    - `DELETE` → 200, and the body is unchanged from today: `{ deleted: true }` for items/locks/reservations/users, and the deleted record for activity-type/activity.
    - `GET` again → 404, and `DELETE` again → 404.
  - (d) Config: seed one config through its model. `PUT` with the valid body → 200 and the updated record. `PATCH` with the device body → 200.
  - (e) An unknown id with an **invalid** body (`PUT /api/items/UNKNOWN` with `{}`) → **400**, because the body is checked before existence.
  - (f) `PUT /api/items/UNKNOWN` doesn't create an item: count the items before and after.

  **Expect failure**: (a) is 200 for 15 operations, and (c) and (d)'s second answers are 200 (research R1).
- [X] T003 [P] [US1] In `src/items/items.service.spec.ts`, `src/locks/locks.service.spec.ts` and `src/reservations/reservations.service.spec.ts`, add `describe`s for `findOne`, `update` and `remove`. Mock the model methods (`findById`, `findByIdAndUpdate`, `findByIdAndDelete`) to return `{ exec: jest.fn().mockResolvedValue(x) }`.
  - `x = null` → rejects with `NotFoundException`, message `<kind> #<id> not found` (`item` / `lock` / `reservation`).
  - `x` = a record → `findOne` and `update` resolve to it, and `remove` resolves to `{ deleted: true }`.
  - `update` is called with `{ new: true }` and **no** `upsert` (FR-004).

  Keep the existing `findAll` tests; in reservations, keep its tests as they are. **Expect failure**: nothing rejects.
- [X] T004 [P] [US1] Do the same in `src/config/config.service.spec.ts` (`update`, and `updateAnalogLecure` with the right key; a wrong key still rejects `NotFoundException('Invalid API Key')`), `src/activity-type/activity-type.service.spec.ts` (`findOne`, `update`, `remove`, where `remove` resolves to the deleted record) and `src/activity/activity.service.spec.ts` (`update` → `NotFoundException('Activity not found')`, keeping the existing wording). Messages: `config #<id> not found`, `activity type #<id> not found`. Replace any definedness-only test in these files (Principle I). **Expect failure**: nothing rejects.
- [X] T005 [P] [US1] In `src/users/users.service.spec.ts`, add: `update(UNKNOWN, { changePassword: true, password: 'n', currentPassword: 'c' })` with `findById(...).select(...)` or the `findWithPassword` query resolving `null` → rejects `NotFoundException('user #<id> not found')`. Read `findWithPassword` to mock its exact chain. **Expected to pass already**: implementation showed `findWithPassword` already throws (R5 corrected). This test pins the 404 rather than failing first.

### Implementation for User Story 1

- [X] T006 [US1] In `src/items/items.service.ts`, `src/locks/locks.service.ts` and `src/reservations/reservations.service.ts`, make `findOne`, `update` and `remove` `async`:
  - `await` the query with `.exec()`, then `if (!doc) throw new NotFoundException(\`<kind> #${id} not found\`)`.
  - `remove` returns `{ deleted: true }` only after a document came back.
  - Add a one-line comment saying why it awaits: an unawaited query is always truthy, so the check never ran (D2).

  T003 must pass.
- [X] T007 [US1] Apply the same pattern in `src/config/config.service.ts` (`update`, and `updateAnalogLecure` after the key check), `src/activity-type/activity-type.service.ts` (all three; `remove` returns the deleted record) and `src/activity/activity.service.ts` (`update`, message `Activity not found`). T004 must pass.
- [X] T008 [US1] No change needed in `src/users/users.service.ts`: `findWithPassword` already throws `user #<id> not found` (R5 corrected). Confirm T005 and the existing users specs are green.
- [X] T009 [US1] Run `pnpm test` and `pnpm test:e2e -- test/records/record-ids.e2e-spec.ts`. T002 must pass. Also run `pnpm test:e2e -- test/security` to confirm the authorization matrix is unaffected. The D2 cases in `contract-discrepancies.e2e-spec.ts` now fail, as intended; they are removed in T016.

**Checkpoint**: Issue #8 is fixed.

---

## Phase 3: User Story 2 - A malformed id is a clear client mistake (Priority: P2)

**Goal**: A malformed id gets **400** `Invalid id "<value>"` on all 20 operations. It never
gets a 500 or a false deletion, and access refusals still come first (FR-002, FR-005).

**Independent Test**: Every operation with `abc` answers 400. No DELETE answers
`{ deleted: true }`. Without a token → 401, and a guest on an admin route → 403.

### Tests for User Story 2 ⚠️

- [X] T010 [P] [US2] Create `src/common/pipes/parse-object-id.pipe.spec.ts`:
  - `'6aba80d38c58c96b58020000'` is returned unchanged.
  - `'abc'`, `''`, `'123456789012'` (12 characters, which `ObjectId.isValid` accepts) and `'zzzzzzzzzzzzzzzzzzzzzzzz'` each throw `BadRequestException` with message `Invalid id "<value>"`.

  **Expect failure**: the module doesn't exist.
- [X] T011 [P] [US2] In `test/records/record-ids.e2e-spec.ts`, add `describe('US2: malformed id')`:
  - (a) `it.each(OPS)`: `MALFORMED` → **400**, and `body.message` contains `Invalid id`.
  - (b) For the three DELETEs on items, locks and reservations, the body is not `{ deleted: true }`.
  - (c) `MALFORMED` without a token → **401** on every operation. The device route (`PATCH config`) is also 401 without a token, per the matrix.
  - (d) The guest token on each `admin` operation with `MALFORMED` → **403**.
  - (e) `PUT /api/items/abc` with an invalid body `{}` → 400. Record which message wins, the id's or the body's (analysis U1; research R3 predicts the id's).

  **Expect failure**: 500, or 200 `{ deleted: true }` (research R2).
- [X] T012 [P] [US2] In the seven controller specs (`src/{users,items,reservations,locks,config,activity,activity-type}/*.controller.spec.ts`), add a test per by-id handler. Read `ROUTE_ARGS_METADATA` for the handler, as `reservations.controller.spec.ts` does for its query pipe, and assert that the `id` param's `pipes` include `ParseObjectIdPipe`. **Expect failure**: no pipe is bound.

### Implementation for User Story 2

- [X] T013 [US2] Create `src/common/pipes/parse-object-id.pipe.ts`: a `@Injectable() class ParseObjectIdPipe implements PipeTransform<string, string>`. It accepts a value only when `Types.ObjectId.isValid(value)` and `String(new Types.ObjectId(value)) === value.toLowerCase()`, which rejects 12-character strings. Otherwise it throws `new BadRequestException(\`Invalid id "${value}"\`)`. Explain in a comment why it's a pipe (it runs after guards, at the HTTP edge; research R3) and why there's a round-trip check. T010 must pass.
- [X] T014 [US2] In the seven controllers, change each of the 20 `@Param('id') id: string` to `@Param('id', ParseObjectIdPipe) id: string`. In `src/activity/activity.service.ts` `remove`, delete the now-unreachable `if (!Types.ObjectId.isValid(id)) throw new Error('Invalid id')` branch, and its `Types` import if it's no longer used. T011 and T012 must pass.

**Checkpoint**: Issue #12 is fixed, and both stories pass.

---

## Phase 4: Polish, Contract and Register

- [X] T015 In each of the 20 operations' `@ApiRefusals(...)`, add **400** and **404** where they're missing, keeping the access statuses, so each matches the "Documented after" column of `specs/008-fix-unknown-id-404/contracts/by-id-routes.md`. Update any operation description that mentions D2 or D7 (search the controllers for "D2", "D7" and "empty body").
- [X] T016 In `test/docs/contract-discrepancies.e2e-spec.ts`, delete both `it('D2: …')` cases and `it('D7: …')`, and remove `UNKNOWN` if it's unused. Add D2 and D7 to the header's "Not here" list (fixed by 008, pinned by `test/records/record-ids.e2e-spec.ts`). Run `pnpm test:e2e -- test/docs`, which must be green.
- [X] T017 Run `pnpm docs:export` and check the diff semantically, comparing old and new `openapi.json` per operation as in 007:
  - Only the 20 by-id operations change.
  - Only their `responses` change (400 and 404 added), plus any description edited in T015.
  - Nothing else changes.

  Then run `pnpm build && pnpm docs:check`.
- [X] T018 [P] In `specs/005-openapi-contract-export/discrepancies.md`, mark **D2** and **D7** resolved:
  - Add `**Status**: Resolved by \`specs/008-fix-unknown-id-404\` (2026-09-30); closes #8` (and `#12` for D7).
  - Point Evidence at `test/records/record-ids.e2e-spec.ts`.
  - For D2, add "Also found": malformed ids on the item, lock and reservation DELETEs answered `{ deleted: true }`, and an unknown account with `changePassword` would have been a 500.
  - For D7, correct the Operation(s) line: it covered every by-id operation, not only GET.
  - Add a new entry, **D16**: `PUT /api/users/:id` answers **406** for a wrong current password or a missing new one. It is undocumented, and `test/docs` check 4 doesn't allow documenting it (analysis D1). Record it only: behaviour unchanged, no issue opened without the user's approval.
- [X] T019 [P] In `CLAUDE.md`, replace "Several by-id routes return 200 with an empty body despite code that looks like it throws 404." with a still-true example of why behaviour must be run, not read. For instance: the reservation list once looked bounded but returned everything (006). Set `**Status**: Implemented` in `specs/008-fix-unknown-id-404/spec.md`, and tick tasks here as you go.
- [X] T020 Run the gates directly on the working tree, without committing (analysis P1): `pnpm lint:ci && pnpm test --coverage && pnpm test:e2e && pnpm build && pnpm docs:check && pnpm audit --audit-level high`. All must pass. `pnpm verify` runs later, after the user asks for the commit and before the push. Measure coverage against `main` and record it. Fix any failure; don't skip it.
- [X] T021 Walk through `quickstart.md` § 2 against a local server (start the built app if the dev server isn't running, then stop it). Use only the read and invalid-id requests listed; they change nothing. Record the statuses.
- [X] T022 Draft the PR description; opening it needs the user's approval. It needs:
  - `Closes #8` and `Closes #12`, the root causes (R1, R2, R5), and the principles touched (I, II, III, IV).
  - **Flagged for reviewer** (R7): clients that got an empty 200 for a missing record now get 404, and malformed ids get 400 instead of 500. The Flutter app should treat 404 on a by-id call as "record gone".
  - The gate results, including e2e.
  - The attribution line.

  After merge, confirm both issues closed, and close them by hand if GitHub didn't link them (as happened with #7).

---

## Dependencies & Execution Order

- **T001** blocks T002 and T011, which both edit the e2e file, so they run one after the other.
- **US1 (T002–T009)** and **US2 (T010–T014)** are independent of each other. US1 goes first by priority.
- Within US1: T003, T004 and T005 run in parallel (separate files). T006, T007 and T008 each follow their own test task.
- Within US2: T010 and T012 run in parallel. T013 comes before T014.
- **Polish**: T015 comes before T017. T016 and T018 can run alongside T015. T020 depends on T015–T019, and T022 on T020 and T021.

### Parallel Opportunities

- T003 ∥ T004 ∥ T005 (service specs).
- T010 ∥ T012 (pipe spec ∥ controller specs).
- T018 ∥ T019 (docs).

## Parallel Example: User Story 1

```text
Task: "T003 items/locks/reservations service specs: missing record → NotFoundException"
Task: "T004 config/activity-type/activity service specs"
Task: "T005 users findWithPassword → NotFoundException"
# after seeing them fail:
Task: "T006 items/locks/reservations services"   Task: "T007 config/activity-type/activity services"   Task: "T008 users"
```

## Implementation Strategy

- **MVP**: Phase 1 and US1 fix issue #8. Don't ship yet: the D2 tests and the contract need
  Phase 4, and `pnpm verify` would fail on `docs:check` and the discrepancy tests.
- **Incremental**: US1 → US2 → Polish, each ending on a green checkpoint.

## Notes

- Total: 22 tasks. Each story opens with tests that fail first.
- The e2e suite covers all 20 operations in both stories, so SC-001 and SC-002 are checked
  by counting passing cases: 20 each.

## Implementation notes (2026-09-30)

- Red first:
  - 28 unit tests failed on the missing not-found checks.
  - The e2e suite had 43 of 83 tests failing: the false 200s and the 500s.
  - The pipe and controller specs failed on the missing module.
- Research R5 was wrong: `findWithPassword` already threw, so the `changePassword` path was
  already a 404. The test pins it and no change was made.
- Two test expectations were corrected against real behaviour:
  - A wrongly typed item body gives **500**. That is D8 (#13), out of scope, so the
    body-first cases use activity-type, which answers 400.
  - The activity DELETE has always answered `{ message: 'Activity deleted successfully' }`.
- Research R3 confirmed: with a malformed id **and** an invalid body, the id's 400 wins
  (`Invalid id "abc"`, observed against the local server).
- The contract changes only on 19 operations, and only in `responses`. `PUT /api/users/:id`
  already documented 400 and 404.
- Gates:
  - lint ✅
  - unit 268/268 ✅
  - e2e 520/520 across 11 suites ✅
  - build ✅
  - docs:check ✅
  - audit: no high/critical ✅

  Line coverage is **87.93%**, up from 79.48% on `main`.
- Analysis D1: the undocumented 406 on `PUT /api/users/:id` is recorded as **D16**, with no
  issue opened.
- Nothing is committed (analysis P1). `pnpm verify` runs once the user asks for the commit.

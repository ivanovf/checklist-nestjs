# Tasks: Accurate, Exported API Contract

**Input**: Design documents from `specs/005-openapi-contract-export/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. Constitution Principle I (test-first) is non-negotiable, and FR-013,
FR-014, FR-015 and FR-017 are themselves test deliverables. Every test task comes before
the code that makes it pass, and must be seen failing first.

**Organization**: grouped by user story. US1 (offline export) and US2 (accurate contract)
are both P1; US3 (drift guard) is P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2 or US3, from spec.md

## Ground rules for every task

- **No runtime behaviour change** (FR-012). Only decorators, documentation-only classes,
  the exporter, scripts, CI, docs and tests change. If a task seems to need a behaviour
  change, stop: record it in `discrepancies.md` instead.
- **Real behaviour is observed, not read** (research R7). "Observe" means calling the
  route against the local database (`pnpm db:setup`, `pnpm start:dev`) with the seeded
  admin `dev.admin@localhost.test` / `localdevadmin`, and noting the status and body keys.
- **Regenerate after decorator changes**: `pnpm docs:export` rewrites `openapi.json`.
  Never hand-edit that file.
- The conventions (decorators, statuses, descriptions) are in
  `contracts/documentation-conventions.md`. The command behaviour is in
  `contracts/commands.md`.

---

## Phase 1: Setup

**Purpose**: repository plumbing that makes generated output deterministic, plus the register.

- [X] T001 [P] Create `.gitattributes` at the repository root with the line `openapi.json text eol=lf` (research R4)
- [X] T002 [P] Append `openapi.json` to `.prettierignore` so formatters never rewrite generated output (research R4)
- [X] T003 [P] Create `specs/005-openapi-contract-export/discrepancies.md` with the fields from data-model.md "Discrepancy entry" (ID, Operation(s), Observed, Apparent intent, Evidence, Principle, Issue). Seed D1–D4 from research R7 with Evidence and Issue set to `pending`

---

## Phase 2: Foundational (blocks all stories)

**Purpose**: one shared document builder, used both by the served `/docs` and by the exporter, so they cannot disagree.

- [X] T004 Write the failing unit test `src/openapi/openapi-document.spec.ts`. `buildOpenApiDocument(app)` returns a document whose `info` is title `Checklist API`, description `Documentación Checklist API`, version `1.0`, with `openapi` `3.0.0`. Use a minimal `Test.createTestingModule` with one dummy controller carrying `@ApiTags('X')` and assert its path appears under the `api` global prefix
- [X] T005 Implement `src/openapi/openapi-document.ts` exporting `buildOpenApiDocument(app: INestApplication): OpenAPIObject`, moving the `DocumentBuilder` config out of `src/bootstrap.ts` unchanged. T004 passes
- [X] T006 Change `src/bootstrap.ts` to call `buildOpenApiDocument(app)` instead of building the document inline. The served `/docs` stays local-only. Run `pnpm test` and the existing `test/security/transport-security.e2e-spec.ts`; both stay green (no behaviour change)

**Checkpoint**: one builder, used by the running app.

---

## Phase 3: User Story 1 — Read the contract offline (Priority: P1) 🎯 MVP

**Goal**: `pnpm docs:export` writes a complete, deterministic `openapi.json` with no database or secrets.

**Independent test**: quickstart §1. With no database and no `.env.local`, `pnpm docs:export` exits 0, the file lists 38 operations, and a second run leaves `git status` clean.

### Tests for User Story 1 ⚠️ write first, see them fail

- [X] T007 [P] [US1] Create `test/docs/openapi-contract.ts`: `loadContract()` reads and parses the root `openapi.json`, and `operations(doc)` returns `{ method, path, op }[]`, converting `{id}` to `:id` so keys match `AUTHORIZATION_MATRIX` in `test/security/authorization-matrix.ts`
- [X] T008 [US1] Create `test/docs/contract-completeness.e2e-spec.ts` containing **check 1 only** (contracts/documentation-conventions.md): the document's operations equal the `AUTHORIZATION_MATRIX` rows in both directions, reporting missing and extra keys by name. It fails now because `openapi.json` does not exist

### Implementation for User Story 1

- [X] T009 [US1] Create `src/openapi/export.ts`, the entry point run as `node dist/src/openapi/export.js`:
  - set fixed placeholder env: `NODE_ENV=local`, `DB_DRIVE=mongodb`, `DB_HOST=unreachable.invalid`, `DB_NAME`/`DB_USER`/`DB_PASS`/`SECRET`/`TANK_API_KEY=placeholder`, and unset `CORS_ORIGINS`;
  - `NestFactory.create(AppModule, { preview: true, abortOnError: false, logger: false })`, `app.setGlobalPrefix('api')`, then `buildOpenApiDocument(app)`;
  - serialize with `JSON.stringify(doc, null, 2) + '\n'`, write to `<repo>/openapi.json`, and exit 0;
  - on error, print to stderr and exit 1.

  It must not read `.env.*` values into the document (research R1, R4)
- [X] T010 [US1] Add `"docs:export": "nest build && node dist/src/openapi/export.js"` to `package.json` scripts, and add `"!openapi/export.ts"` to `jest.collectCoverageFrom` beside `!main.ts` (research R10)
- [X] T011 [US1] Run `pnpm docs:export` with the local database stopped and `.env.local` moved aside (quickstart §1). Commit the generated `openapi.json`, today's thin document. T008 now passes. Run it twice and confirm the output is byte-identical

**Checkpoint**: the contract is readable offline. It is still thin, but it is complete in its route list.

---

## Phase 4: User Story 2 — Trust what the contract says (Priority: P1)

**Goal**: every operation documents real inputs, real success shapes, and exactly the refusals it produces.

**Independent test**: quickstart §3. Checks 2–7 pass, and any operation called using only the contract behaves as documented.

### Tests for User Story 2 ⚠️ write first, see them fail

- [X] T012 [US2] Extend `test/docs/contract-completeness.e2e-spec.ts` with checks 2–5 from `contracts/documentation-conventions.md`:
  - **check 2**: tag, summary, one described 2xx with a schema or a described empty body, and a non-empty description on every status;
  - **check 3**: the {401, 403} subset equals the matrix set: `auth`→401, `admin`→401+403, `device`→401, `public`→none, with the named exception that `post /api/login` documents 401;
  - **check 4**: statuses only from {2xx, 400, 401, 403, 404, 429, 503}, with 429 only on sign-in and 503 only on health;
  - **check 5**: no response schema, resolving `$ref`s, has a `password` property.

  Each failure names the operation. **Confirm it fails** on the T011 document
- [X] T013 [P] [US2] Write the failing unit test `src/common/decorators/api-refusals.decorator.spec.ts`: applying `@ApiRefusals(401, 403)` to a dummy route yields response metadata for exactly 401 and 403, with the fixed descriptions from `contracts/documentation-conventions.md`, and schema `ErrorResponseDto`

### Shared building blocks

- [X] T014 [P] [US2] Create the documentation-only `src/common/dto/error-response.dto.ts` (`ErrorResponseDto`: `statusCode: number`, `message: string | string[]`, `error: string`). Observed shape: sign-in with a bad password returns `{"message":"User or password incorrect.","error":"Unauthorized","statusCode":401}`
- [X] T015 [US2] Implement `src/common/decorators/api-refusals.decorator.ts`: `ApiRefusals(...statuses: Array<400 | 401 | 403 | 404 | 429>)` composing `ApiResponse` per status with the fixed descriptions and the `ErrorResponseDto` schema. T013 passes

- [X] T038 [US2] **D4 fix (clarified)**: typed query binding for `limit`/`offset`.
  - First write failing regression tests in `test/docs/pagination-query.e2e-spec.ts`, using `createTestApp({ transport: true })`. For each of `GET /api/users/all`, `/api/items/all` and `/api/locks/all` with a valid token: missing `limit` → 400, missing `offset` → 400, `limit=abc` → 400, and `limit=10&offset=0` → 200. Run them against the current code: they must **pass**, pinning today's statuses.
  - Then create `src/filter_dto/pagination-query.dto.ts`: `PaginationQueryDto` with `limit` and `offset`, both `@Type(() => Number) @IsInt()`, **no** `@IsOptional`, and no new range rules that would change a status.
  - In the three controllers, replace the two `@Query('<name>', ParseIntPipe)` params with `@Query(new ValidationPipe({ transform: true })) query: PaginationQueryDto`, and pass `query.limit`/`query.offset` to the unchanged service.
  - Re-run: still green. Remove the `ParseIntPipe` imports.
  - Runs after T015 and before T017, T018, T020, which then document `PaginationQueryDto` instead of adding `@ApiQuery`.
  - *(ID out of sequence: added by clarification after tasks were generated.)*

### Per module: observe → record → document → replace controller test

Each module task below covers **all** of these steps, for that module's files only:

a. **Observe** every route of the module (success status, body keys, and whether 400 or 404 really occur). Record any mismatch with the code's apparent intent as a new `D<n>` in `discrepancies.md`.

b. Create documentation-only response classes in `src/<module>/dto/<entity>-response.dto.ts` with exactly the observed keys, `_id`, `createdAt`, `updatedAt` and `__v` included, and never `password` (FR-008).

c. Add `@ApiOperation({ summary })`, `@ApiOkResponse`/`@ApiCreatedResponse({ type, description })` (with `type: [X]` for lists, or a description stating an empty body), and `@ApiRefusals(...)` per the matrix plus observed 400/404. Add `@ApiQuery` for values read without a DTO, with `required` as observed, and `@ApiBearerAuth()` or `@ApiSecurity('api-key')`.

d. Where the controller spec is definedness-only, replace it with tests asserting routing, guard metadata (`@Public`/`@Roles`) and input binding (FR-017).

- [X] T016 [P] [US2] **auth** ⚠️ `src/auth/**`, so a security review is required. In `src/auth/controllers/auth.controller.ts`:
  - `@ApiTags('Auth')`;
  - `@ApiBody({ type: LoginRequestDto })` with a new `src/auth/dto/login-request.dto.ts` (`email`, `password`);
  - `@ApiCreatedResponse({ type: LoginResponseDto })` with a new `src/auth/dto/login-response.dto.ts` (`access_token`, `user { email, id, role }`; observed 201);
  - `@ApiRefusals(401, 429)` on `POST /api/login`, and `@ApiRefusals(401)` plus the documented `authorization` header on `GET /api/login/validate`, after observing its success body.

  `auth.controller.spec.ts` already has 5 real tests: keep them, and add none unless the observation reveals a gap
- [X] T017 [P] [US2] **users**: `src/users/users.controller.ts` and `src/users/dto/user-response.dto.ts` (observed keys: `_id, email, name, role, createdAt, updatedAt, __v`). `GET /api/users/all`: `@ApiQuery` for `limit` and `offset` with `required: true` (D1, observed 400 when omitted), and response `type: [UserResponseDto]`. By-id: the missing-id 404 is observed, so document it. Replace the definedness-only `src/users/users.controller.spec.ts`
- [X] T018 [P] [US2] **items**: `src/items/items.controller.ts` and `src/items/dto/item-response.dto.ts`. `GET /api/items/:id` with an unknown id: **200, empty body** (D2). Document it as success with a description stating the body is empty when no item matches, and **no** 404. Observe `PUT` and `DELETE` with an unknown id too, and record any further mismatch. Replace `src/items/items.controller.spec.ts`
- [X] T019 [P] [US2] **reservations**: `src/reservations/reservations.controller.ts` and `src/reservations/dto/reservation-response.dto.ts`. `GET /api/reservations/all` is bound to `FilterReservationDto` (`src/filter_dto/filter-reservation.dto.ts`). Today the document marks all six query values `required: true`, so **observe** which really are, and correct the documentation only; do not change the DTO's validation. Record any mismatch as a `D<n>`. Replace `src/reservations/reservations.controller.spec.ts`
- [X] T020 [P] [US2] **locks**: `src/locks/locks.controller.ts` and `src/locks/dto/lock-response.dto.ts`. `GET /api/locks/all` takes `limit`/`offset`, so observe and apply D1 if the behaviour matches. Replace `src/locks/locks.controller.spec.ts`
- [X] T021 [P] [US2] **config**: `src/config/config.controller.ts` and `src/config/dto/config-response.dto.ts`. `PATCH /api/config/:id` is `device` access: `@ApiSecurity('api-key')` and `@ApiRefusals(401)` only (the `ApiKeyGuard` never returns 403; research R5). Observe where the key is read, from the body `apiKey` field or a header, and document accordingly. Replace `src/config/config.controller.spec.ts`
- [X] T022 [P] [US2] **activity-type**: `src/activity-type/activity-type.controller.ts` and `src/activity-type/dto/activity-type-response.dto.ts`. All routes are `admin` → `@ApiRefusals(401, 403, …)`. Its controller spec has 2 real tests, so keep them and extend only if the observation reveals a gap
- [X] T023 [P] [US2] **activity**: `src/activity/activity.controller.ts` and `src/activity/dto/activity-response.dto.ts`. `GET /api/activity` is bound to `src/activity/dto/filter-activity.dto.ts`. Its three query values are documented as required today, so observe and correct the documentation only. `GET /api/activity/:id` already references `Activity`, so switch it to the response class if `Activity` could expose unintended fields. Replace `src/activity/activity.controller.spec.ts`
- [X] T024 [P] [US2] **health and app**: `src/health/health.controller.ts` already documents 200 and 503, so add `@ApiOperation` only. In `src/app.controller.ts`, observe `GET /api` and add a summary and a described success response. Both are public: no `@ApiRefusals`
- [X] T025 [US2] Run `pnpm docs:export` and commit `openapi.json`. Run `pnpm test:e2e test/docs`: checks 1–5 now pass. Fix any operation they name (depends on T016–T024)

### Execution proof (FR-015, option B)

- [X] T026 [US2] Create `test/docs/contract-sample.e2e-spec.ts` (check 6), using `createTestApp({ transport: true })` from `test/security/app-factory.ts` and `seedAccounts`/`tokenFor` from `test/support/auth-fixtures.ts`. For each of these operations, the real status equals the contract's success status, and the body's keys equal the documented schema's properties, using `loadContract()`:
  - `POST /api/login` (public, with the documented body);
  - `GET /api/health` (public);
  - `GET /api/users/all?limit=10&offset=0` (auth);
  - `POST /api/activity-type` (admin);
  - `PATCH /api/config/:id` (device, with the key).
- [X] T027 [US2] Create `test/docs/contract-discrepancies.e2e-spec.ts` (check 7): one test per `discrepancies.md` entry, reproducing the observed behaviour. For example, D1: `GET /api/users/all` without `limit` returns 400; D2: `GET /api/items/<unknown ObjectId>` returns 200 with an empty body; D3: a user record includes `__v`. Each test name starts with its `D<n>`. Fill each entry's Evidence in `discrepancies.md` with the test name
- [X] T028 [US2] Open one GitHub issue per `discrepancies.md` entry (except D4, fixed by T038) with `gh issue create --label bug`. The title is `D<n>: <operation> <observed vs intent>`, and the body links to the register entry and the proving test. Record each issue number in the entry's Issue field (FR-011)

**Checkpoint**: the contract is accurate and proven where FR-015 requires.

---

## Phase 5: User Story 3 — The contract cannot silently go stale (Priority: P2)

**Goal**: CI fails when `openapi.json` differs from what the code generates.

**Independent test**: quickstart §2. Renaming a DTO field without re-exporting makes `pnpm build && pnpm docs:check` exit 1 with the "out of date" message. Re-exporting makes it exit 0.

- [X] T029 [US3] Add a `--check` mode to `src/openapi/export.ts`: generate in memory, compare byte-for-byte with the committed `openapi.json`, and never write. On mismatch or a missing file, print the three-line message from `contracts/commands.md`, including the first differing path or schema name, and exit 1. On match, exit 0
- [X] T030 [US3] Add `"docs:check": "node dist/src/openapi/export.js --check"` to `package.json` (no rebuild; contracts/commands.md)
- [X] T031 [US3] In `.github/workflows/ci.yml`, change the "Build" step's `run` to `pnpm build && pnpm docs:check`, keeping the "Constitution gate 4" comment, so there are still five gates (research R3)
- [X] T032 [US3] Prove the guard by following quickstart §2 exactly: the drift case exits 1, the regenerated case exits 0, and removing an `@ApiOperation` makes check 2 name the operation. Revert the experiment with `git checkout`
  - *Progress 2026-09-28*: drift → exit 1 naming `schema CreateLockDto`; re-export → exit 0; restore → exit 0. Removing `@ApiOperation` from `post /api/locks` then fails exactly one check 2 test, which names the operation

**Checkpoint**: all three stories are complete and independently verifiable.

---

## Phase 6: Polish & Cross-Cutting

- [X] T033 [P] Update `CLAUDE.md` (FR-016):
  - the "Every endpoint needs…" bullet names `@ApiRefusals(...)` from `src/common/decorators/`, and states that `test/docs/` (completeness, matrix agreement, sample, discrepancies) enforces it;
  - add `pnpm docs:export` and `pnpm docs:check` to "Run & test locally";
  - state that `openapi.json` is generated and must be committed with any contract change.
- [X] T034 [P] Add a short "API contract" section to `README.md`: where `openapi.json` is, how to regenerate it, and that it is read offline
- [X] T035 Run all gates and record the results: `pnpm lint:ci && pnpm test && pnpm test:e2e && pnpm build && pnpm docs:check && pnpm audit --audit-level high`. The coverage floors hold (80% overall, 90% `src/auth`)
- [X] T036 Run quickstart §1–§3 end to end and tick the results in `specs/005-openapi-contract-export/quickstart.md`
- [ ] T037 Write the PR description. It states:
  - the principles touched (I, II, III, IV);
  - flags both deviations from plan.md "Complexity Tracking" for reviewer acknowledgement;
  - requests the `src/auth/**` security review;
  - lists the discrepancy issue numbers.

---

## Dependencies & Execution Order

- **Setup (T001–T003)**: no dependencies, all [P].
- **Foundational (T004–T006)**: blocks every story.
- **US1 (T007–T011)**: needs Foundational. **MVP**: this alone ships an offline contract.
- **US2 (T012–T028)**: needs US1, because its checks read `openapi.json` and it re-exports.
  - T012 and T013 come first, and are seen failing.
  - T014 and T015 come before the module tasks.
  - T016–T024 are parallel.
  - Then T025 → T026, T027 → T028.
- **US3 (T029–T032)**: needs only US1 (the exporter). It **may run before or alongside US2**; doing it early protects US2's work from drifting.
- **Polish (T033–T037)**: after all stories.

### Parallel opportunities

- T001, T002 and T003 together.
- T007 alongside T009. T013 alongside T014.
- **T016–T024: nine modules in parallel.** Each touches only its own module's files. The
  one shared file, `openapi.json`, is regenerated once in T025, and `discrepancies.md`
  entries are appended in order afterwards.
- US3 (T029–T032) alongside US2.
- T033 alongside T034.

### Parallel example: User Story 2

```text
After T015:
  T017 users   T018 items   T019 reservations   T020 locks   T021 config
  T022 activity-type   T023 activity   T024 health/app   T016 auth (+ security review)
Then: T025 re-export and checks → T026 sample, T027 discrepancies → T028 issues
```

## Implementation Strategy

1. **MVP**: Setup, Foundational, then US1. `openapi.json` exists and is complete in routes. Stop and validate with quickstart §1.
2. **Guard early**: US3 next (4 tasks). From here on, every commit that changes the contract must carry the regenerated file.
3. **Accuracy**: US2, module by module. Each module task is a reviewable increment. Checks 2–5 turn green as the last module lands.
4. **Close**: the proof tests, the issues, the docs, and the gates.

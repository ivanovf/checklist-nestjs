---

description: "Task list for API Security Hardening"
---

# Tasks: API Security Hardening

**Input**: Design documents from `/specs/001-api-security-hardening/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Test tasks ARE included. The spec requires them explicitly (FR-023: every control must
carry a test that fails if the control is removed) and constitution Principle I makes test-first
non-negotiable. Within every story, tests are written first and MUST fail before implementation.

**Organization**: Grouped by user story so each can be implemented, tested, and shipped alone.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5, mapping to the spec's user stories
- Exact file paths are given in every task

## Path Conventions

Single NestJS project. Source at `src/`, tests at `test/` and alongside sources as `*.spec.ts`.

**Two decisions confirmed by the owner before this list was generated:**

1. `activity` routes take the same shape as every other resource — writes and deletes
   administrator-only, reads open to any authenticated account (matrix rows 23–27 unchanged).
2. The `UsersService.update` password-hash leak is fixed **in this feature**, in Phase 2.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and scaffolding needed by every later phase

- [X] T001 Install runtime dependencies `helmet`, `@nestjs/throttler`, and `joi` via npm and commit the updated `package.json` and `package-lock.json`
- [X] T002 [P] Install dev dependency `mongodb-memory-server` via npm for integration and e2e tests
- [X] T003 [P] Create the shared cross-cutting directories `src/common/decorators/`, `src/common/filters/`, and `src/common/interceptors/` with a `.gitkeep` in each
- [X] T004 [P] Add per-path coverage thresholds to the `jest` block in `package.json`: 90% lines for `src/auth/**` and a changed-files floor, per the plan's Complexity Tracking entry (the global 80% gate is deferred to feature 002)
- [X] T005 [P] Create `.github/workflows/ci.yml` running lint, unit tests, e2e tests, and build on pull requests and pushes to `main` (the audit and secret-scan gates are added in US2)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Configuration plumbing, schema constraints, and the test harness that every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Configuration plumbing (research R7)

- [X] T006 [P] Create the inert `@Public()` marker decorator in `src/common/decorators/public.decorator.ts` using `SetMetadata('isPublic', true)` — no guard reads it yet, which is why it belongs here rather than in US1
- [X] T007 [P] Create `src/config/env.validation.ts` exporting a Joi schema covering `NODE_ENV`, `PORT`, and the `DB_*` values per `contracts/configuration.md`; leave `SECRET`, `TANK_API_KEY`, `CORS_ORIGINS`, and `LOGIN_*` to the stories that own them
- [X] T008 Move `ConfigModule.forRoot` to be the **first** entry in the `imports` array in `src/app.module.ts` and pass it the schema from T007 as `validationSchema` — correctness currently rests on `DatabaseModule` being initialised before the module that loads the env file
- [X] T009 Refactor `database.module.ts` to inject `ConfigService` in its `useFactory` instead of reading `process.env` directly (depends on T008)
- [X] T010 [P] Refactor the `JwtModule.registerAsync` factory in `src/auth/auth.module.ts` to inject `ConfigService` instead of reading `process.env.SECRET`
- [X] T011 [P] Refactor `src/auth/strategy/jwt-strategy.ts` to inject `ConfigService` for `secretOrKey` instead of reading `process.env.SECRET`

### Account schema and the password-hash leak

- [X] T012 Write a failing test in `src/users/users.service.spec.ts` asserting that no response returned by `UsersService.update` contains a `password` property
- [X] T013 Constrain `role` in `src/users/entities/user.entity.ts` to `@Prop({ required: true, enum: Role, default: Role.AUTHENTICATED })` so the least-privileged value is the default (FR-004, data-model.md)
- [X] T014 Write a one-off read-only audit script at `scripts/audit-user-roles.ts` that reports accounts whose `role` is absent, empty, or not a member of the `Role` enum, and run it before T013's constraint is relied on — a verification step, not a data migration
- [X] T015 Add `select: false` to the `password` prop in `src/users/entities/user.entity.ts` so the hash is excluded at the schema level (depends on T013 — same file)
- [X] T016 Fix `UsersService.update` in `src/users/users.service.ts`: replace `delete (await updated).password` with an explicit projection, and fix the `if (!updated)` check that currently tests an always-truthy Mongoose Query rather than its result (makes T012 pass)
- [X] T017 Audit the remaining `UsersService` methods in `src/users/users.service.ts` for any other path that could return the hash now that `select: false` is set, and confirm `skipPassword` is still correct for `create`, `findAll`, and `findOne`

### Test harness

- [X] T018 Create `test/support/mongo-memory.ts` providing `mongodb-memory-server` setup and teardown helpers so integration and e2e suites run against a real MongoDB engine rather than mocks (constitution Principle I)
- [X] T019 Create `test/support/auth-fixtures.ts` providing helpers to seed an `admin` account and an `authenticated` account and to obtain a signed token for each — every story's e2e suite depends on these
- [X] T020 Update `test/jest-e2e.json` to load the T018 harness via `globalSetup`/`globalTeardown` and to discover suites under `test/security/`

**Checkpoint**: Configuration is validated and injected, the account schema is constrained, the password leak is closed, and the e2e harness runs. User stories can now begin.

---

## Phase 3: User Story 1 — Role restrictions are actually enforced (Priority: P1) 🎯 MVP

**Goal**: Every endpoint enforces the access level it declares. Closes the live privilege-escalation defect where 24 of 37 routes do not enforce what they appear to declare.

**Independent Test**: Sign in as a non-administrator and call every administrator-only route; each must return `403` with no side effect. Ships and delivers value with none of US2–US5 present.

### Tests for User Story 1 ⚠️ Write first, confirm they FAIL

- [X] T021 [P] [US1] Create the table-driven suite `test/security/authorization-matrix.e2e-spec.ts` driven by `contracts/authorization-matrix.md`, exercising all 37 routes as anonymous, as `authenticated`, and as `admin`, asserting the outcome each row states
- [X] T022 [P] [US1] Add a test to `test/security/authorization-matrix.e2e-spec.ts` asserting that the set of routes the application registers at runtime **equals** the set in the matrix, so a new unlisted endpoint fails the build
- [X] T023 [P] [US1] Add tests to `test/security/authorization-matrix.e2e-spec.ts` asserting a refused request produces **no side effect** — the target resource is unchanged after a `403` on every write and delete route
- [X] T024 [P] [US1] Write `src/auth/guards/roles.guard.spec.ts` covering class-level `@Roles` metadata, absent `request.user`, and a role that is not a member of the `Role` enum — all three must deny
- [X] T025 [P] [US1] Write a test in `test/security/authorization-matrix.e2e-spec.ts` for FR-005: sign in as `admin`, demote the account in the database, then call an administrator-only route with the still-valid token and assert `403`
- [X] T026 [P] [US1] Write `src/auth/guards/jwt-auth.guard.spec.ts` asserting routes marked `@Public()` bypass authentication and all others require it

### Implementation for User Story 1

- [X] T027 [US1] Create `src/auth/guards/jwt-auth.guard.ts` extending `AuthGuard('jwt')`, returning early for handlers or classes marked with the T006 `@Public()` decorator (research R1)
- [X] T028 [US1] Fix `src/auth/guards/roles.guard.ts`: read metadata with `reflector.getAllAndOverride('roles', [getHandler(), getClass()])` — the handler-only lookup misses `ActivityTypeController`'s class-level declaration entirely (research R2)
- [X] T029 [US1] In `src/auth/guards/roles.guard.ts`, deny when `request.user` is absent instead of dereferencing it, and deny when the user's role is not a member of the `Role` enum (FR-004)
- [X] T030 [US1] In `src/auth/guards/roles.guard.ts`, replace the `console.log` on denial with the Nest `Logger`, recording account, route, and timestamp and never credentials or request bodies (FR-006)
- [X] T031 [US1] Modify `validate()` in `src/auth/strategy/jwt-strategy.ts` to load the account by id and return its **currently stored** role rather than the token's role claim (research R3, FR-005)
- [X] T032 [US1] Register the global guard chain in `src/app.module.ts` as two `APP_GUARD` providers in order — `JwtAuthGuard` then `RolesGuard` — so authentication resolves `request.user` before the role check reads it (depends on T027–T029)
- [X] T033 [US1] Mark the root handler in `src/app.controller.ts` with `@Public()` so it keeps working under default-deny (matrix row 1)
- [X] T034 [P] [US1] Add explicit `@Roles` decorators to all five routes in `src/activity/activity.controller.ts` per matrix rows 23–27 — admin for `POST` and `DELETE`, authenticated for the three reads
- [X] T035 [P] [US1] Remove the now-redundant per-route `@UseGuards(AuthGuard('jwt'))` from `src/config/config.controller.ts` (three routes), leaving the global chain to enforce
- [X] T036 [P] [US1] Remove the now-redundant class-level `@UseGuards(...)` from `src/reservations/reservations.controller.ts`, `src/users/users.controller.ts`, `src/activity-type/activity-type.controller.ts`, `src/activity/activity.controller.ts`, `src/items/items.controller.ts`, and `src/locks/locks.controller.ts`
- [X] T037 [US1] Run `test/security/authorization-matrix.e2e-spec.ts` and confirm all 37 routes × 3 caller types pass, then temporarily remove the `RolesGuard` provider from `src/app.module.ts` and confirm the suite fails — the control must be provably load-bearing (FR-023)

**Checkpoint**: The privilege-escalation defect is closed and provably tested. This is a shippable MVP on its own.

---

## Phase 4: User Story 2 — The service refuses to run misconfigured (Priority: P1)

**Goal**: Startup fails loudly on bad configuration, and no credential literal remains in the source tree.

**Independent Test**: Remove or empty each required value in turn; the service exits naming it. A secret scan of the tree reports zero findings.

### Tests for User Story 2 ⚠️ Write first, confirm they FAIL

- [ ] T038 [P] [US2] Create `test/security/config-validation.e2e-spec.ts` asserting that for **each** required value in `contracts/configuration.md`, starting without it exits non-zero and names that value (SC-004)
- [ ] T039 [P] [US2] Add tests to `test/security/config-validation.e2e-spec.ts` for the present-but-empty case (`SECRET=`) — it must fail, not be accepted as a valid empty string
- [ ] T040 [P] [US2] Add tests to `test/security/config-validation.e2e-spec.ts` asserting `SECRET` and `TANK_API_KEY` below 32 characters fail at startup (FR-009)
- [ ] T041 [P] [US2] Write `src/auth/guards/api-key.guard.spec.ts` covering a correct key, an incorrect key, and an absent header, replacing the existing definedness-only stub

### Implementation for User Story 2

- [ ] T042 [US2] Extend the Joi schema in `src/config/env.validation.ts` with `SECRET` and `TANK_API_KEY` at a 32-character minimum, and the `LOGIN_*` defaults from `contracts/configuration.md`
- [ ] T043 [US2] Configure the schema in `src/config/env.validation.ts` with `abortEarly: false` and surface every failing value in one message, so a misconfigured deployment is fixed in one cycle rather than several
- [ ] T044 [US2] Rewrite `src/auth/guards/api-key.guard.ts` to read the expected key from `ConfigService` (`TANK_API_KEY`) and compare it with a constant-time comparison, removing the hardcoded `'mytoken'` literal (FR-010, research R4)
- [ ] T045 [US2] Apply `@Public()` and `@UseGuards(ApiKeyGuard)` to the `@Patch(':id')` tank-level route in `src/config/config.controller.ts` — currently the only unauthenticated write endpoint in the service (matrix row 17)
- [ ] T046 [US2] Add a `gitleaks` secret-scan step and an `npm audit --audit-level=high` step to `.github/workflows/ci.yml` so a reintroduced credential literal fails the build (FR-012)
- [ ] T047 [P] [US2] Create `.env.example` documenting every value in `contracts/configuration.md` with its rule and placeholder — never a real value
- [ ] T048 [US2] Verify no secret is baked into any build artifact by checking `docker/Dockerfile`, `serverless.yml`, and `vercel.json` inject configuration at runtime only (constitution, Security Standards)

**Checkpoint**: The service cannot start degraded, and the tank endpoint is no longer an open write.

---

## Phase 5: User Story 3 — Sign-in attempts are throttled (Priority: P2)

**Goal**: Password guessing is bounded per account, and the bound survives the serverless instance lifecycle.

**Independent Test**: Six wrong-password attempts against one account; the sixth returns `429`. Restart the service and the lockout still holds.

### Tests for User Story 3 ⚠️ Write first, confirm they FAIL

- [ ] T049 [P] [US3] Create `test/security/login-throttling.e2e-spec.ts` asserting attempts 1–5 return `401` and the 6th returns `429` with `retryAfterSeconds` per `contracts/auth-endpoints.md`
- [ ] T050 [P] [US3] Add a test to `test/security/login-throttling.e2e-spec.ts` asserting the **correct** password during a lockout still returns `429` and the password is never evaluated (FR-014)
- [ ] T051 [P] [US3] Add a test to `test/security/login-throttling.e2e-spec.ts` asserting lockout state survives an application restart and is visible to a second application instance (FR-016) — this is the property in-memory throttling cannot provide
- [ ] T052 [P] [US3] Add a test to `test/security/login-throttling.e2e-spec.ts` asserting four failures followed by the correct password succeed, so users below the threshold are unaffected
- [ ] T053 [P] [US3] Add a timing test to `test/security/login-throttling.e2e-spec.ts` asserting the response-time distributions for an unknown account and a known account with a wrong password are not separable by an order of magnitude (FR-015)
- [ ] T054 [P] [US3] Write `src/auth/services/login-attempt.service.spec.ts` covering the state transitions in `data-model.md`, including identifier normalisation and read-time lockout expiry

### Implementation for User Story 3

- [ ] T055 [P] [US3] Create the `LoginAttempt` schema in `src/auth/entities/login-attempt.entity.ts` with the fields in `data-model.md`, a unique index on `identifier`, and a TTL index on `expiresAt` with `expireAfterSeconds: 0`
- [ ] T056 [US3] Create `src/auth/services/login-attempt.service.ts` implementing record, reset, and lock-check, normalising the identifier (trim, lower-case) before every lookup and write, and evaluating `lockedUntil` at read time so expiry never depends on a background job (depends on T055)
- [ ] T057 [US3] Register the `LoginAttempt` model and `LoginAttemptService` in `src/auth/auth.module.ts`
- [ ] T058 [US3] Modify `validateUser` in `src/auth/services/auth.service.ts` to always perform a bcrypt comparison — against a precomputed dummy hash when the account does not exist — so the unknown-account and wrong-password paths cost the same (research R6, FR-015)
- [ ] T059 [US3] Integrate `LoginAttemptService` into `src/auth/services/auth.service.ts`: check the lock before evaluating the password, record failures, and reset the streak on success (depends on T056, T058)
- [ ] T060 [US3] Throw a `429` carrying `retryAfterSeconds` from `src/auth/services/auth.service.ts` when locked, matching the contract in `contracts/auth-endpoints.md`
- [ ] T061 [US3] Log every throttling decision from `src/auth/services/login-attempt.service.ts` with identifier, outcome, and timestamp — never the attempted password (FR-006)
- [ ] T062 [US3] Register `ThrottlerModule` in `src/app.module.ts` with a coarse per-IP limit as defence in depth, keeping the per-account lock as the primary control (research R5)

**Checkpoint**: Guessing attacks are bounded and the bound cannot be reset by forcing a cold start.

---

## Phase 6: User Story 4 — Only approved sites can call the API from a browser (Priority: P2)

**Goal**: Browser requests are accepted only from an explicitly configured, per-environment origin list.

**Independent Test**: A request from an unapproved origin receives no `Access-Control-Allow-Origin`; an approved origin does. A deployed environment without an origin list refuses to start.

### Tests for User Story 4 ⚠️ Write first, confirm they FAIL

- [ ] T063 [P] [US4] Create `test/security/cors.e2e-spec.ts` asserting an unapproved `Origin` receives no `Access-Control-Allow-Origin` header and an approved one is echoed back
- [ ] T064 [P] [US4] Add a test to `test/security/cors.e2e-spec.ts` asserting that with `NODE_ENV=production` and no `CORS_ORIGINS`, the service refuses to start rather than approving every origin (FR-018)

### Implementation for User Story 4

- [ ] T065 [US4] Add `CORS_ORIGINS` to the Joi schema in `src/config/env.validation.ts` as a comma-separated list of absolute origins, required whenever `NODE_ENV` is not `local` — this conditional requirement is what makes FR-018 enforceable
- [ ] T066 [US4] Replace the bare `app.enableCors()` in `src/main.ts` with an explicit origin allowlist parsed from `CORS_ORIGINS` (depends on T065)
- [ ] T067 [US4] Set `CORS_ORIGINS` for each deployed environment in its platform configuration (Heroku config vars, `serverless.yml` environment, and Vercel project settings) and document the values in `.env.example` — **blocked on the owner supplying them**; this blocks release of a deployed environment, not implementation or local validation

**Checkpoint**: Cross-origin access is bounded per environment, with no open fallback.

---

## Phase 7: User Story 5 — Responses carry protective headers (Priority: P3)

**Goal**: Standard protective headers on every response, and errors that disclose nothing internal.

**Independent Test**: Any response carries the agreed header set and no `x-powered-by`; a malformed identifier yields a generic `400` rather than a driver cast error.

### Tests for User Story 5 ⚠️ Write first, confirm they FAIL

- [ ] T068 [P] [US5] Create `test/security/response-headers.e2e-spec.ts` asserting every header in the "Protective response headers" table of `contracts/error-shape.md` is present on every response, and that no `X-Powered-By` or `Server` version header appears (FR-019, FR-020)
- [ ] T069 [P] [US5] Create `test/security/error-shape.e2e-spec.ts` asserting each status row in `contracts/error-shape.md` produces the uniform body and discloses nothing from the prohibited list
- [ ] T070 [P] [US5] Add a test to `test/security/error-shape.e2e-spec.ts` forcing an unrecognised internal exception and asserting a generic `500` in the response while the detail reaches the log

### Implementation for User Story 5

- [ ] T071 [US5] Register `helmet()` as global middleware in `src/main.ts` configured to the "Protective response headers" table in `contracts/error-shape.md`, and disable `x-powered-by` explicitly — applied in-application so all three deployment targets behave identically (research R8)
- [ ] T072 [US5] Create `src/common/filters/all-exceptions.filter.ts` producing the uniform body from `contracts/error-shape.md`, mapping any unrecognised exception to a generic `500` with detail written only to the log
- [ ] T073 [US5] Register the T072 filter globally in `src/main.ts` and confirm Mongoose `CastError` and duplicate-key errors no longer surface driver detail (depends on T072)
- [ ] T074 [US5] Add `whitelist: true` to the `ValidationPipe` in `src/main.ts` and log every property that **would** have been rejected — step one of the two-step rollout (research R10)
- [ ] T075 [US5] Add `forbidNonWhitelisted: true` to the `ValidationPipe` in `src/main.ts` — **do not start this until T074 has run for one release** and the logs confirm no legitimate client sends extra fields (FR-022, depends on T074)
- [ ] T076 [US5] Decide and implement the Swagger exposure rule in `src/main.ts` — the docs route is currently public in every environment; make that a deliberate, stated choice rather than an accident of configuration

**Checkpoint**: All five stories complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T077 [P] Add or correct Swagger metadata — tag, summary, and documented response statuses including `401`, `403`, and `429` — in `src/reservations/reservations.controller.ts`, `src/users/users.controller.ts`, `src/config/config.controller.ts`, `src/activity/activity.controller.ts`, `src/activity-type/activity-type.controller.ts`, `src/items/items.controller.ts`, `src/locks/locks.controller.ts`, and `src/auth/controllers/auth.controller.ts` (constitution Principle IV)
- [ ] T078 [P] Update `README.md` with the configuration table from `contracts/configuration.md` and the local setup steps from `quickstart.md`, replacing the untouched NestJS starter content
- [ ] T079 Confirm `.github/workflows/ci.yml` enforces all five constitution gates — lint, unit tests, e2e tests, build, audit — plus the secret scan, and that a failing gate blocks the merge
- [ ] T080 Run the full validation in `specs/001-api-security-hardening/quickstart.md` end to end, including every manual confirmation step
- [ ] T081 Verify SC-009 using the "Confirming nothing regressed" section of `specs/001-api-security-hardening/quickstart.md`: exercise each role's legitimate operations and confirm zero user-visible change — the front end works, the device integration updates the tank level via `PATCH /api/config/:id` with its key, and response bodies are unchanged
- [ ] T082 Reconcile `contracts/authorization-matrix.md` against the routes the application registers and correct any drift introduced during implementation
- [ ] T083 Measure p95 latency for `GET /api/reservations/all` and `PUT /api/reservations/:id` against the constitution's 300 ms / 500 ms budgets, confirming the per-request account lookup added in `src/auth/strategy/jwt-strategy.ts` (T031) stays inside them

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Phase 1 — **blocks all user stories**
- **US1 (Phase 3)**: depends on Phase 2. No dependency on any other story
- **US2 (Phase 4)**: depends on Phase 2. T045 additionally needs T006's `@Public()` marker — which is why that decorator sits in Foundational rather than in US1
- **US3 (Phase 5)**: depends on Phase 2 only
- **US4 (Phase 6)**: depends on Phase 2 only
- **US5 (Phase 7)**: depends on Phase 2 only
- **Polish (Phase 8)**: depends on every story that is being shipped

### Shared-file serialisation

Three files are touched by more than one phase and cannot be edited in parallel across them:

- `src/config/env.validation.ts` — created in T007, extended by T042/T043 (US2) and T065 (US4)
- `src/app.module.ts` — T008 (Foundational), T032 (US1), T062 (US3)
- `src/main.ts` — T066 (US4), T071/T073/T074/T075/T076 (US5)

### Within Each User Story

Tests are written and confirmed failing before implementation. Entities before services, services before guards and endpoints, and the story's own verification task last.

### Parallel Opportunities

- Phase 1: T002–T005 in parallel after T001
- Phase 2: T006, T007, T010, T011 in parallel; T013→T015→T016 are serial (same file, then dependent)
- Every story's test tasks are `[P]` with each other — they are separate suites
- US1's T034–T036 touch different controllers and run in parallel
- With more than one person: after Phase 2, US1 / US3 / US4+US5 can proceed on three tracks

---

## Parallel Example: User Story 1

```bash
# All six US1 test suites can be written in parallel:
Task: "Table-driven matrix suite in test/security/authorization-matrix.e2e-spec.ts"   # T021
Task: "Route-set equality assertion in the same suite"                                # T022
Task: "No-side-effect-on-refusal assertions"                                          # T023
Task: "RolesGuard unit tests in src/auth/guards/roles.guard.spec.ts"                  # T024
Task: "Current-role resolution test (FR-005)"                                         # T025
Task: "JwtAuthGuard @Public bypass tests"                                             # T026

# Then the controller edits, which touch different files:
Task: "Explicit @Roles on src/activity/activity.controller.ts"                        # T034
Task: "Drop redundant guards from src/config/config.controller.ts"                    # T035
Task: "Drop redundant class guards from the remaining six controllers"                # T036
```

---

## Implementation Strategy

### MVP scope — US1 only

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **stop and validate**.

That is 37 tasks and it closes the live privilege-escalation defect plus the password-hash leak.
Everything after it is genuine hardening against attacks that are not yet in progress. If only one
thing ships from this feature, ship this.

### Incremental delivery

US1 (privilege escalation) → US2 (open write endpoint, embedded credential) → US3 (guessing) →
US4 (origins) → US5 (headers and error disclosure). Each is independently deployable and
independently valuable, in descending order of what an attacker could do today.

### Sequencing note on T075

`forbidNonWhitelisted` is the one task in this list that can break a working client. It is
deliberately gated behind a release of T074's logging so the decision rests on observed client
behaviour rather than an assumption. Do not collapse the two.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task
- Verify every test fails before writing the implementation it covers
- FR-023 requires each control to be provably load-bearing: after a control passes, remove it and
  confirm its test fails. T037 does this for US1 explicitly; apply the same check to each story
- Commit after each task or logical group
- T067 is blocked on the owner supplying the approved origin values — it blocks release of a
  deployed environment, not implementation or local validation

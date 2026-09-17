---

description: "Task list for Vercel Deployment Configuration"
---

# Tasks: Vercel Deployment Configuration

**Input**: Design documents from `/specs/002-fix-vercel-deploy/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: **Required, not optional.** Constitution Principle I is marked NON-NEGOTIABLE:
behaviour must be covered by a test that fails before the implementation exists, and
`it('should be defined')` stand-ins do not count. Test tasks below are therefore mandatory
and are ordered before the implementation they cover.

**Organization**: Grouped by user story so each can be implemented, tested, and shipped
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task serves (US1–US4)
- Exact file paths are given in every task

## Path Conventions

Single NestJS project at repository root: `src/` for source, `test/` for end-to-end specs,
unit specs colocated beside their subject (the established convention in this repo).

---

## Phase 1: Setup

**Purpose**: Get the local toolchain onto the target runtime and establish a known-good
baseline, so any later failure is attributable to this feature rather than pre-existing.

- [X] T001 Upgrade the local runtime to Node 24 (`nvm install 24 && nvm use 24`) and confirm `node -v` reports `v24.x`; the machine currently runs 22.12.0, which is below the version this feature declares
- [X] T002 Reinstall dependencies on the new runtime with `npm install --include=dev` and confirm no `EBADENGINE` warnings remain (Node 24 satisfies `eslint-visitor-keys`, which warns on 22.12.0)
- [X] T003 Record the baseline by running all four gates — `npm run lint:ci`, `NODE_ENV=local npm test -- --coverage`, `NODE_ENV=local npm run test:e2e`, `npm run build` — and confirm all four pass before any change is made

**Checkpoint**: Local toolchain matches the declared runtime and all gates are green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None required.

This feature has no shared foundational layer to build. Each story touches a different
configuration surface, and the only new module (`src/health/`) depends on the existing
application wiring rather than on anything introduced here. Inventing tasks for this phase
would add ceremony without reducing risk.

One genuine cross-story constraint exists and is recorded here rather than discovered later:

- **`src/bootstrap.ts` is modified by four separate tasks across US1 and US2** (helmet, the
  CORS allowlist, documentation gating). Those tasks touch the same file and therefore
  **must not** be marked `[P]` or run concurrently. They are sequenced explicitly in Phase 4.

**Checkpoint**: Proceed directly to User Story 1.

---

## Phase 3: User Story 1 - A deploy of the current commit succeeds and the API answers (Priority: P1) 🎯 MVP

**Goal**: The platform builds and publishes the service, and the published deployment can
be confirmed genuinely healthy — not merely "returned a 200".

**Independent Test**: Trigger a deploy of the branch head, confirm it completes, then call
`/api/health` on the resulting URL and confirm it reports the data store as available.
Ships value alone: the service becomes reachable for the first time.

### Tests for User Story 1

> Write these first and confirm they fail before implementing.

- [X] T004 [P] [US1] Unit spec for health state mapping in `src/health/health.service.spec.ts`: `connected` → available; `disconnected`, `connecting`, `disconnecting`, `uninitialized` → unavailable. `connecting` must NOT be treated as success — see [contracts/health-endpoint.md](./contracts/health-endpoint.md)
- [X] T005 [P] [US1] Unit spec for the health controller in `src/health/health.controller.spec.ts`: 200 with `{status:"ok",database:"up"}` when available, 503 with `{status:"error",database:"down"}` when not, and assert the body contains no host, credential, or driver error text (FR-017)
- [X] T006 [US1] End-to-end spec in `test/security/health.e2e-spec.ts`: `/api/health` is reachable with no credential (confirming the public marker), and an unknown path still answers 404 from the application (FR-004)

### Implementation for User Story 1

- [X] T007 [P] [US1] Create `public/robots.txt` disallowing all crawlers — the single deliberately published static file; do NOT add `index.html`, which would shadow `/` and stop it reaching the application ([research.md](./research.md) R1)
- [X] T008 [P] [US1] Set `"outputDirectory": "public"` in `vercel.json`; this is the fix for the `No Output Directory named "public"` build failure. Never set it to `.` — static files resolve before rewrites, so that would publish the whole repository ([research.md](./research.md) R8)
- [X] T009 [US1] Implement `src/health/health.service.ts` using `@InjectConnection()` from `@nestjs/mongoose` to read `readyState`; treat only `1` (`connected`) as available. Read state only — do not open a connection, which would regress the per-instance connection reuse in `src/serverless.ts` (FR-009)
- [X] T010 [US1] Implement `src/health/health.controller.ts` with `GET health`, marked `@Public()` (authorization is default-deny and deploy verification carries no credential), returning 503 rather than a 200 carrying a failure field (FR-016), with Swagger metadata for both statuses
- [X] T011 [US1] Create `src/health/health.module.ts` wiring the controller and service
- [X] T012 [US1] Register `HealthModule` in `src/app.module.ts`
- [X] T013 [US1] Run `NODE_ENV=local npm run test:e2e` and `npm run build`, then execute quickstart Scenarios 1–3 in [quickstart.md](./quickstart.md) to confirm a clean checkout builds and the handler serves with environment variables only

**Checkpoint**: The deploy blocker is removed and the service reports its own health. This
is a shippable increment on its own — but see the warning in Implementation Strategy before
promoting it to production.

---

## Phase 4: User Story 2 - The public deployment carries its required protections (Priority: P1)

**Goal**: The three controls Constitution III requires of every deployed environment are in
force: an explicit cross-origin allowlist, security response headers, and rate limiting on
authentication. The browsable documentation page is withdrawn from deployed environments.

**Independent Test**: Against a running service, request from an unapproved origin and
confirm access is not granted; inspect any response for the protective headers; exceed the
sign-in rate from one source and confirm refusal; confirm `/docs` is not served when the
environment is deployed.

### Tests for User Story 2

> Write these first and confirm they fail before implementing.

- [X] T014 [P] [US2] Unit spec in `src/config/env.validation.spec.ts` for `CORS_ORIGINS`: required when `NODE_ENV=production`, rejected when present-but-empty, rejected when wrapped in quotes (the hosting dashboard does not strip them), optional when local — per [data-model.md](./data-model.md)
- [X] T015 [P] [US2] Unit spec for origin parsing in `src/config/env.validation.spec.ts`: trims whitespace after separators, drops empty entries so a trailing comma is harmless, preserves order
- [X] T016 [P] [US2] End-to-end spec in `test/security/transport-security.e2e-spec.ts`: assert `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security` and `Content-Security-Policy` are present, and that `X-Powered-By` is **absent**, on both a successful and an error response (headers must not depend on the happy path). Assert this named subset rather than all thirteen headers, which would fail on any helmet upgrade — see [contracts/transport-security.md](./contracts/transport-security.md) §2
- [X] T017 [P] [US2] Extend `test/security/transport-security.e2e-spec.ts`: an approved origin is granted access and an unapproved origin is not (FR-012)
- [X] T018 [P] [US2] Extend `test/security/transport-security.e2e-spec.ts`: `/docs` is served when not deployed and not served when deployed (FR-002a). When served, also assert the response carries **no** `Content-Security-Policy`, so its inline script can execute — a test asserting only 200 would pass against a silently blank Swagger page whose script the CSP blocked
- [X] T019 [P] [US2] End-to-end spec in `test/security/auth-throttle.e2e-spec.ts`: 5 sign-in attempts within 60s are processed, the 6th is refused, attempts with a **wrong password** are counted (the case the guard ordering in T025 protects), the refusal lifts when the window resets with no residual block, and a non-auth route is unaffected (confirming the guard is scoped, not global)

### Implementation for User Story 2

> T021–T023 all modify `src/bootstrap.ts`. Run them sequentially — none is `[P]`.

- [X] T020 [US2] Add `CORS_ORIGINS` to the Joi schema in `src/config/env.validation.ts`: required when `NODE_ENV=production`, optional locally, each entry a syntactically valid absolute origin. Reuses feature 001's existing configuration contract verbatim rather than defining a new mechanism
- [X] T021 [US2] In `src/bootstrap.ts`, replace the bare `app.enableCors()` with an explicit allowlist built from the parsed `CORS_ORIGINS` value read via `ConfigService`. The current blanket call grants every origin and is prohibited by Constitution III outside local development
- [X] T022 [US2] In `src/bootstrap.ts`, register `helmet()` via `app.use()` so every response from both entry points carries the protective headers. It goes in the shared setup precisely so the deployed path cannot diverge from the local one
- [X] T023 [US2] In `src/bootstrap.ts`, register the Swagger page only when the environment is not deployed, leaving document generation and per-endpoint metadata untouched so Constitution IV is unaffected. Inside the same condition, register a `/docs`-scoped middleware **after** the global helmet that calls `res.removeHeader('Content-Security-Policy')` — helmet's `script-src 'self'` otherwise blocks Swagger UI's inline initializer and the page renders blank. `helmet({contentSecurityPolicy: false})` scoped to the path does NOT work; see [contracts/transport-security.md](./contracts/transport-security.md) §4
- [X] T024 [US2] Register `ThrottlerModule` in `src/app.module.ts` as `forRoot([{ name: 'default', ttl: seconds(60), limit: 20 }])`; `ttl` is milliseconds in throttler v5+, so use the exported `seconds` helper to make the unit explicit
- [X] T025 [US2] In `src/auth/controllers/auth.controller.ts`, apply `@Throttle({ default: { limit: 5, ttl: seconds(60) } })` to the login route and change its guards to `@UseGuards(ThrottlerGuard, AuthGuard('local'))`. **`ThrottlerGuard` must come first** — guards run in declaration order, so if the auth guard runs first a wrong password throws 401 before the counter increments and failed sign-ins are never counted. Scope it to this controller rather than registering it globally, which would alter the deliberate global guard ordering (authenticate, then authorize)
- [X] T026 [US2] Add the in-memory rate-limiting limitation to the `### Known Deviations` section of `spec.md`: counters are per-instance, so on a scaled-out serverless deployment the limit is not deployment-wide. [research.md](./research.md) R5 requires this be recorded so FR-015 is not later read as a stronger guarantee than what ships
- [X] T027 [US2] Run quickstart Scenarios 4 and 5 in [quickstart.md](./quickstart.md) to confirm the protections are active and that startup fails fast on a missing, empty, or quoted `CORS_ORIGINS`

**Checkpoint**: The published deployment is compliant with Constitution III and no longer
advertises its own endpoint map.

---

## Phase 5: User Story 3 - One runtime version across local, CI, and production (Priority: P2)

**Goal**: The runtime version is declared once in the repository and governs local
development, CI, and the deployed environment, eliminating the override warning and the
build-cache invalidation the failing deploy reported.

**Independent Test**: Deploy twice without changing dependencies and confirm the log shows
no version-override warning, no version-change cache invalidation, and cache reuse on the
second deploy.

- [X] T028 [P] [US3] Change `engines.node` in `package.json` from `22.x` to `24.x`, matching the hosting project's already-configured `24.x`. Verified: no direct dependency's `engines.node` constraint excludes Node 24
- [X] T029 [P] [US3] In `.github/workflows/ci.yml`, replace `node-version: 22` with `node-version-file: package.json` so CI derives the runtime from the single declaration in T028 rather than repeating it — FR-005 requires the version be declared in exactly one place. `setup-node` resolves this file against `volta.node` then `engines.node`; if the first CI run rejects it, fall back to `node-version: 24` and reword FR-005 to "one authoritative declaration from which others derive"
- [X] T030 [US3] Re-run all four gates on Node 24 and confirm they pass, then confirm `npm install --include=dev` reports no `EBADENGINE` warnings (depends on T028 and T029)

**Checkpoint**: One runtime version, agreed by all three environments.

---

## Phase 6: User Story 4 - The deployment exposes the API and nothing else (Priority: P3)

**Goal**: Confirm the published deployment serves the API and the single intended static
file, and nothing else the repository contains. This story is a guard on the US1
implementation rather than new capability.

**Independent Test**: Against the deployed URL, request a source file, the dependency
manifest, the deployment configuration, a spec document, and the documentation page, and
confirm none returns content.

- [X] T031 [US4] Add an exposure sweep to `test/security/transport-security.e2e-spec.ts` asserting the application answers 404 for source-like paths (`/src/main.ts`, `/package.json`, `/vercel.json`), documenting in a comment that the authoritative check is against a real deployment because static resolution happens at the platform layer, above the application
- [ ] T032 [US4] **BLOCKED — requires a live deployment, which cannot be produced from here.** Execute quickstart Scenario 6 in [quickstart.md](./quickstart.md) against the deployed preview URL and confirm every path returns 404 except `/robots.txt`. Any other 200 means the output directory is publishing more than intended

**Checkpoint**: The published static surface is exactly one intended file.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T033 Confirm coverage floors still hold after the new `src/health/` code and the `src/bootstrap.ts` changes — 80% overall and 90% for `src/auth/**` — via `NODE_ENV=local npm test -- --coverage`
- [X] T034 [P] Add `CORS_ORIGINS` to the deploy prerequisites in `specs/002-fix-vercel-deploy/quickstart.md` if any detail drifted during implementation, so the deploy checklist stays accurate
- [X] T035 [P] Re-run `npm run lint:ci` and confirm it neither fails nor modifies files (it must stay read-only, unlike the developer-facing `npm run lint`)
- [ ] T036 **PARTIAL — local scenarios 1-5 executed and passing; the deploy-dependent steps and the PR description need a real deployment.** Run the full quickstart validation end to end (Scenarios 1–6 plus the post-deploy checks) and record the results in the pull request description, naming which constitution principles this change touches as the workflow rules require

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; start immediately
- **Foundational (Phase 2)**: empty by design; blocks nothing
- **US1 (Phase 3)**: after Setup. Independently shippable
- **US2 (Phase 4)**: after Setup. Independent of US1 in principle, but T021–T023 share
  `src/bootstrap.ts`, so if US1 and US2 are worked concurrently that file must be
  coordinated
- **US3 (Phase 5)**: after Setup. Fully independent — touches only `package.json` and
  `ci.yml`. Safe to pull forward and land alongside US1
- **US4 (Phase 6)**: requires US1's `outputDirectory` change (T008) to be deployed, since it
  verifies that decision
- **Polish (Phase 7)**: after the stories being shipped are complete

### Within Each User Story

- Tests are written and failing before the implementation they cover
- Service before controller; controller before module registration
- Configuration schema (T020) before the code that reads it (T021)

### Parallel Opportunities

| Group | Tasks | Why safe |
|---|---|---|
| US1 unit specs | T004, T005 | Different new files |
| US1 config changes | T007, T008 | `public/robots.txt` and `vercel.json` are unrelated |
| US2 test authoring | T014–T019 | Different spec files; T016–T018 share one file, so treat them as one unit if authored concurrently |
| US3 declarations | T028, T029 | `package.json` and `ci.yml` are unrelated |
| Polish | T034, T035 | Documentation versus a lint run |

**Never parallel**: T021, T022, T023 — all three edit `src/bootstrap.ts`.

---

## Parallel Example: User Story 1

```bash
# Author both unit specs together (different new files):
Task: "Unit spec for health state mapping in src/health/health.service.spec.ts"
Task: "Unit spec for the health controller in src/health/health.controller.spec.ts"

# Apply both configuration changes together (unrelated files):
Task: "Create public/robots.txt disallowing all crawlers"
Task: "Set outputDirectory to public in vercel.json"
```

---

## Implementation Strategy

### Recommended order: US1 → US3 → US2 → US4

This differs from strict priority order for a practical reason. US1 and US3 together are
the entire deploy fix — four small file changes plus the health module — and US3 is
completely independent, so landing it early removes the build-cache churn from every
subsequent deploy while you iterate.

### MVP (US1 only)

1. Phase 1: Setup
2. Phase 3: US1
3. **Stop and validate**: quickstart Scenarios 1–3, then a preview deploy

**Warning before promoting the MVP to production.** US1 alone makes the service reachable
*without* the protections Constitution III requires of a deployed environment — cross-origin
access is still granted to every origin, no protective headers are set, sign-in is
unthrottled, and the documentation page still publishes the endpoint map. That is acceptable
on a preview URL while iterating. Promoting it to production means knowingly shipping out of
compliance, so US2 should follow immediately rather than being scheduled later.

### Incremental delivery

1. Setup → toolchain on Node 24, baseline green
2. US1 → deploy succeeds, health route reports honestly → preview deploy
3. US3 → one runtime version everywhere → clean deploy logs
4. US2 → protections active → **now safe to promote to production**
5. US4 → exposure verified against the real deployment
6. Polish → coverage, lint, full quickstart run

### Deploy prerequisites that no task can satisfy

Two items live outside the repository and will block a working deployment regardless of
whether every task above is complete:

- Environment values set in the hosting project, **unquoted**, including the newly required
  `CORS_ORIGINS` once T020 lands, and with `DB_PORT` left unset because `mongodb+srv`
  rejects a port
- Data store network access permitting the platform's dynamic egress addresses

---

## Notes

- `[P]` means different files with no dependency on incomplete work
- Test tasks are mandatory here, not optional — Constitution Principle I is non-negotiable
  and explicitly rejects definedness-only specs as coverage
- Commit after each task or logical group; the branch merges by pull request
- Two constitution gaps are carried deliberately and are recorded rather than fixed: strict
  request-body validation and structured request logging. See
  [plan.md](./plan.md) Complexity Tracking. T026 adds the third (per-instance rate limiting)
  to the spec's Known Deviations

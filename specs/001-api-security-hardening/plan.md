# Implementation Plan: API Security Hardening

**Branch**: `001-api-security-hardening` | **Date**: 2026-09-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-api-security-hardening/spec.md`

## Summary

Close a live privilege-escalation defect and the surrounding security gaps in the Chalet
Checklist API, without changing what the API does for legitimate users.

The core change is to invert the access-control default. Today each controller opts *in* to
authentication and authorization, and four of eight controllers opt in incompletely, so
`@Roles(Role.ADMIN)` decorators on reservations, users, config, and activity-type are inert
metadata. The plan registers authentication and role enforcement as application-wide guards,
makes every public endpoint declare itself public explicitly, and fixes three defects in the
role guard itself that would otherwise keep it from working even once registered.

Around that: startup configuration validation so the service cannot boot in a degraded state,
persisted per-account sign-in throttling that survives the serverless instance lifecycle,
an environment-scoped browser origin allowlist, standard protective response headers, a uniform
error shape that stops leaking internal detail, and CI that enforces all of it.

## Technical Context

**Language/Version**: TypeScript 5.4 on Node.js 18

**Primary Dependencies**: NestJS 10 (Express platform), Passport (`passport-jwt`, `passport-local`),
Mongoose 8, `class-validator` / `class-transformer`, `bcrypt`.
Added by this feature: `helmet` (response headers), `@nestjs/throttler` (coarse request limiting),
`joi` (startup configuration schema). Added as dev dependencies: `mongodb-memory-server`
(integration tests against a real MongoDB engine), `gitleaks` via CI action (secret scanning).

**Storage**: MongoDB via Mongoose 8. Sign-in throttling state is persisted here rather than held
in process memory — see Constraints.

**Testing**: Jest 29 with `ts-jest`, Supertest for HTTP-level tests, `@nestjs/testing` for module
wiring, `mongodb-memory-server` for integration and end-to-end tests.

**Target Platform**: Node.js 18 server, deployed to three targets that all must be satisfied —
AWS Lambda behind API Gateway (`serverless-express`, `dist/lambda.handler`), Vercel
(`@vercel/node` via `vercel.json`), and Heroku (`Procfile`, the `prod` git remote). Every control
in this feature must be applied inside the Nest application rather than at any one platform's
edge, so that all three deployments behave identically.

**Project Type**: Web service — a REST API with no frontend in this repository.

**Performance Goals**: Constitution Principle V budgets apply — reads p95 under 300 ms, writes
p95 under 500 ms, measured server-side excluding cold start. This feature adds one indexed
primary-key read per authenticated request (current-role resolution, see research R3) and one
indexed read/write per sign-in attempt (throttling, R5). Neither is on a list endpoint and both
are primary-key or unique-index lookups.

**Constraints**: The service runs on short-lived, horizontally scaled serverless instances. No
security control may depend on in-process state, because that state is lost on every cold start
and is not shared between concurrent instances — this directly determines the throttling design.
The API has existing consumers (the chalet front end and at least one device integration), so no
change may alter the request or response shape of a currently permitted operation.

**Scale/Scope**: Small private service. Two roles, 8 feature modules, 37 HTTP routes, tens of
accounts. Scope of this change: 8 controllers, 3 guards, 2 Passport strategies, 4 module files,
application bootstrap, and new CI configuration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — see below.*

| Principle | Gate | Pre-Phase 0 | Post-Phase 1 |
|---|---|---|---|
| I. Test-First Discipline | Every control ships with a test that fails first and fails again if the control is removed | PASS with justified deviation | PASS with justified deviation |
| II. Layered NestJS Architecture | Cross-cutting concerns registered as guards/filters/pipes, not inlined in controllers; no raw documents returned | PASS | PASS |
| III. Secure By Default | No embedded secrets; default-deny auth; registered authorization; origin allowlist; headers; rate limiting | PASS — this feature implements the principle | PASS |
| IV. Validated, Documented API Contracts | Whitelist validation, DTOs everywhere, accurate Swagger, consistent error shape | PASS | PASS |
| V. Observability & Performance Budgets | Auth events logged without secrets; no unbounded query added; budgets held | PASS | PASS |

**Principle I deviation (justified, tracked below)**: the constitution sets an 80% global line
coverage floor. This feature cannot reach it alone, because the rest of the repository is covered
only by generated `should be defined` stubs that feature 002 will replace. This plan therefore
enforces the 90% floor on `src/auth/**` in full — which is where the bulk of this feature lives —
plus a changed-files floor, and defers the global 80% gate to feature 002. See Complexity Tracking.

**Principle V partial scope (not a deviation)**: full structured request logging, pagination,
indexing, and connection reuse belong to feature 002. This feature logs only its own security
events (FR-006), which Principle V requires of it.

**No unjustified violations. Gate passes.**

## Project Structure

### Documentation (this feature)

```text
specs/001-api-security-hardening/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — 12 resolved decisions
├── data-model.md        # Phase 1 output — entities, schema deltas, indexes
├── quickstart.md        # Phase 1 output — how to validate the feature end to end
├── contracts/           # Phase 1 output
│   ├── authorization-matrix.md   # Every route → required role → public/protected
│   ├── auth-endpoints.md         # Sign-in, token validation, throttled responses
│   ├── error-shape.md            # Uniform error contract
│   └── configuration.md          # Required environment values and their validity rules
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Created by /speckit-tasks — NOT created by this command
```

### Source Code (repository root)

This is a single NestJS service. The feature touches existing modules and adds a small number of
shared security primitives; it introduces no new top-level project.

```text
src/
├── main.ts                          # MODIFIED — Helmet, CORS allowlist, ValidationPipe
│                                    #   whitelist, global exception filter, Swagger exposure
├── app.module.ts                    # MODIFIED — register APP_GUARD chain, Throttler, Config
│                                    #   validation schema; fix module init ordering
├── config/
│   ├── env.validation.ts            # NEW — Joi schema for required environment values
│   └── config.controller.ts         # MODIFIED — protect the unguarded tank endpoint
├── common/                          # NEW — shared cross-cutting primitives
│   ├── decorators/public.decorator.ts       # NEW — explicit public marker
│   ├── filters/all-exceptions.filter.ts     # NEW — uniform error shape
│   └── interceptors/                        # NEW — security event logging
├── auth/
│   ├── guards/
│   │   ├── jwt-auth.guard.ts        # NEW — global default-deny guard honouring @Public
│   │   ├── roles.guard.ts           # MODIFIED — class-level metadata, missing user,
│   │   │                            #   unknown role, deny-by-default
│   │   └── api-key.guard.ts         # MODIFIED — read key from configuration, not a literal
│   ├── strategy/
│   │   ├── jwt-strategy.ts          # MODIFIED — resolve current role at request time
│   │   └── local-strategy.ts        # unchanged
│   ├── services/
│   │   ├── auth.service.ts          # MODIFIED — timing-safe failure, throttle integration
│   │   └── login-attempt.service.ts # NEW — persisted per-account attempt tracking
│   └── entities/
│       └── login-attempt.entity.ts  # NEW — throttling state, TTL indexed
├── users/                           # MODIFIED — explicit role declarations; password projection
├── reservations/                    # MODIFIED — explicit role declarations
├── activity/, activity-type/,       # MODIFIED — explicit role declarations
│   items/, locks/
└── app.controller.ts                # MODIFIED — mark root/health endpoint @Public

test/
├── app.e2e-spec.ts                  # MODIFIED
├── security/                        # NEW — one e2e suite per user story
│   ├── authorization-matrix.e2e-spec.ts   # US1 — every route × every role
│   ├── config-validation.e2e-spec.ts      # US2 — startup failure per missing value
│   ├── login-throttling.e2e-spec.ts       # US3
│   ├── cors.e2e-spec.ts                   # US4
│   └── response-headers.e2e-spec.ts       # US5
└── jest-e2e.json                    # MODIFIED — in-memory MongoDB setup

.github/workflows/ci.yml             # NEW — lint, test, e2e, build, audit, secret scan
```

**Structure Decision**: Keep the existing single-project NestJS layout. Security primitives that
are not auth-specific (`@Public`, the exception filter, the logging interceptor) go in a new
`src/common/` directory, following the standard Nest convention for cross-cutting code; auth-specific
guards and strategies stay in `src/auth/`, where they already live. No module is relocated, so the
diff stays reviewable and the blast radius of a mistake stays small.

## Phase 0 — Research

Complete. See [research.md](./research.md). Twelve decisions resolved, no NEEDS CLARIFICATION
remaining. The four that most shape the implementation:

- **R1 — Default-deny via `APP_GUARD`**: register `JwtAuthGuard` then `RolesGuard` globally, with an
  explicit `@Public()` decorator for the four genuinely public routes. Chosen over auditing each
  controller because per-controller opt-in is precisely the mechanism that failed.
- **R3 — Current role resolved per request**: `JwtStrategy.validate` loads the account and returns
  its stored role, rather than trusting the role claim minted at sign-in. Required by FR-005; costs
  one primary-key read per request.
- **R4 — `ApiKeyGuard` activated, not deleted**: the unguarded `PATCH /config/:id` tank-level route
  is deliberately public for a device integration, and `TANK_API_KEY` already exists in the
  environment. The guard is wired to that configured key and applied to that route.
- **R5 — Throttling persisted in MongoDB**: a TTL-indexed `login_attempts` collection keyed by
  account, because in-process counters reset on every serverless cold start and are not shared
  across concurrent instances (FR-016).

## Phase 1 — Design & Contracts

Complete. Artifacts:

- **[data-model.md](./data-model.md)** — the `LoginAttempt` entity, the `User` schema delta
  (role becomes a required enum with a default), index definitions including the TTL index, and
  the lockout state transitions.
- **[contracts/authorization-matrix.md](./contracts/authorization-matrix.md)** — all 37 routes with
  their required role and public/protected status. This is the contract US1 is tested against, and
  it is the authoritative list: any route absent from it must fail the build.
- **[contracts/auth-endpoints.md](./contracts/auth-endpoints.md)** — sign-in and token-validation
  request/response contracts, including the throttled-response contract and the
  indistinguishability requirement (FR-015).
- **[contracts/error-shape.md](./contracts/error-shape.md)** — the single error body shape all
  failures must produce, and what must never appear in it.
- **[contracts/configuration.md](./contracts/configuration.md)** — every required environment value,
  its validity rule, which environments it applies to, and the exact startup failure behaviour.
- **[quickstart.md](./quickstart.md)** — how to run and verify each of the five user stories.

### Post-design Constitution re-check

Re-evaluated after the artifacts above were written. No new violations. Two design consequences
were checked explicitly:

- **Principle V (performance)**: R3 adds a `findById` per authenticated request. This is a
  primary-key lookup on an already-indexed field and does not touch a list endpoint, so the 300 ms
  read budget holds. Recorded as a tracked cost rather than an accepted violation.
- **Principle II (layering)**: throttling logic lives in `LoginAttemptService`, not in the strategy
  or controller, keeping the guard/strategy layer free of business rules.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Coverage gate scoped to `src/auth/**` (90%) plus changed files, instead of the constitution's global 80% floor | The repository's existing suite is generated `should be defined` stubs, so the global figure is unreachable by this feature and would block a security fix behind unrelated test debt | Raising global coverage here would pull the whole of feature 002 into this branch, delaying a live privilege-escalation fix. The global gate is not waived, only sequenced — it lands with feature 002 |
| One extra database read per authenticated request to resolve the caller's current role | FR-005 requires authorization to reflect the account's role *now*. Tokens live for 24 hours, so a demoted or revoked administrator would otherwise keep administrator access for up to a day | Trusting the role claim in the token is free but leaves a 24-hour window where revocation does nothing — unacceptable for the one control this feature exists to fix. Shortening token lifetime was also rejected: it degrades usability for every user to fix a rare event |
| A new `login_attempts` collection rather than counters on the `users` document | Keeps authentication-attempt churn off the account record, and a TTL index lets MongoDB expire stale lockouts without a cleanup job | In-memory counters (the usual default) are unusable on serverless: they reset on cold start and are not shared across instances, so an attacker could reset the limit at will (FR-016) |

## Risks

- **Breaking change risk — `forbidNonWhitelisted` (FR-022)**: rejecting unknown payload fields will
  break any existing client that sends extra properties. Mitigation: enable `whitelist` first,
  log what would have been rejected for one release, then enable `forbidNonWhitelisted`. Sequenced
  as separate tasks in `/speckit-tasks`.
- **Breaking change risk — default-deny (FR-003)**: any route not marked `@Public` starts requiring
  authentication. `GET /api` (root) and `PATCH /api/config/:id` (device) are the routes that change
  behaviour; both are enumerated in the authorization matrix and covered by tests.
- **Out-of-scope defect found during planning**: `UsersService.update` returns the updated account
  with its password hash reachable (`delete (await updated).password` on a Mongoose document does
  not reliably remove the field from the serialized response), and its `if (!updated)` check tests a
  Query object that is always truthy. This is a credential-exposure defect adjacent to but not
  covered by this spec's FR list. Recommend folding it into this feature rather than 002; flagged
  for your call at `/speckit-tasks` time rather than silently added to scope.

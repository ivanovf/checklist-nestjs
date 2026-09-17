<!--
Sync Impact Report
==================
Version change: (unversioned template scaffold) → 1.0.0
Bump rationale: MAJOR/initial — first concrete ratification. The previous file was an
unfilled `[PLACEHOLDER]` scaffold with no governing content, so every principle and
section below is newly defined.

Modified principles:
  [PRINCIPLE_1_NAME] (placeholder) → I. Test-First Discipline (NON-NEGOTIABLE)
  [PRINCIPLE_2_NAME] (placeholder) → II. Layered NestJS Architecture
  [PRINCIPLE_3_NAME] (placeholder) → III. Secure By Default
  [PRINCIPLE_4_NAME] (placeholder) → IV. Validated, Documented API Contracts
  [PRINCIPLE_5_NAME] (placeholder) → V. Observability & Performance Budgets

Added sections:
  Security & Data Protection Standards (was [SECTION_2_NAME])
  Development Workflow & Quality Gates (was [SECTION_3_NAME])
  Governance (populated from [GOVERNANCE_RULES])

Removed sections: none

Deferred TODOs: none — RATIFICATION_DATE set to the date of this first adoption
because no earlier ratified version of this document exists in the repository history.
-->

# Chalet Checklist API Constitution

The Chalet Checklist API is a NestJS + MongoDB service that stores chalet reservations,
checklists, activities, locks, items, and configuration. It is a small-team, private
service handling guest reservation data, and it is deployed to serverless targets
(AWS Lambda, Vercel). Every rule below is written for that reality.

## Core Principles

### I. Test-First Discipline (NON-NEGOTIABLE)

Behavior MUST be covered by a test that fails before the implementation exists and passes
after. Scaffolded `it('should be defined')` smoke tests do NOT count as coverage for any
behavior; a spec file that only asserts definedness MUST be replaced by real assertions the
first time its subject is modified.

- Every service method MUST have unit tests covering the success path, at least one
  validation/not-found failure path, and any branching on role or status.
- Every controller MUST have tests asserting routing, guard application, and DTO binding.
- Persistence and auth flows MUST have integration/e2e tests running against a real or
  in-memory MongoDB, never against hand-written mocks alone.
- Line coverage MUST be at least 80% overall and 90% for `src/auth/**`; a PR MUST NOT
  lower either number.
- A bug fix MUST add a regression test that reproduces the bug before the fix lands.

*Rationale*: The codebase currently ships generated placeholder specs, which give the
appearance of testing without the protection. Reservation data is not reconstructible from
elsewhere, so silent regressions are expensive.

### II. Layered NestJS Architecture

Responsibilities MUST stay in the layer that owns them.

- Controllers handle HTTP only: routing, guards, DTO binding, and response shape. They
  MUST NOT contain business rules, database queries, or conditional persistence logic.
- Services own business rules and are the only layer that touches Mongoose models.
- Schemas/entities own persistence shape and indexes. Mongoose documents MUST NOT be
  returned raw from controllers; responses MUST be projected through a DTO or serializer
  so that fields such as password hashes cannot leak by default.
- Each domain lives in its own feature module and exports only what other modules need.
  Cross-module access MUST go through the owning module's exported service, never by
  importing another module's Mongoose model directly.
- TypeScript MUST be used strictly: no `any` in new or modified code, no non-null
  assertions to silence the compiler, and no `@ts-ignore` without an adjacent comment
  naming the constraint that forces it.

*Rationale*: Layer bleed is what turns a small CRUD service into one that cannot be tested
or changed safely, and unprojected documents are the most common accidental data leak in
Mongoose applications.

### III. Secure By Default

Security controls MUST be explicit, centrally enforced, and free of embedded secrets.

- Secrets, tokens, connection strings, and keys MUST come from configuration/environment
  and MUST NOT appear as literals in source. Hardcoded credentials are a blocking defect,
  not a cleanup item.
- Every route is authenticated unless it is deliberately public; a public route MUST carry
  an explicit public marker (e.g. an `@Public()` decorator) so that the exception is
  visible in review.
- Authorization MUST be enforced by a guard that is actually registered. A `@Roles(...)`
  decorator with no corresponding active `RolesGuard` is a security defect, because it
  reads as protection while permitting everything.
- Passwords MUST be stored only as bcrypt hashes and MUST never be selected into a
  response payload.
- CORS MUST declare an explicit origin allowlist per environment. Blanket
  `enableCors()` with no options is prohibited outside local development.
- Security headers (Helmet or equivalent) and rate limiting on authentication endpoints
  MUST be enabled in every deployed environment.
- Dependencies MUST pass `npm audit` with no unresolved high or critical advisories before
  a release; an accepted advisory MUST be recorded with its justification and a review date.

*Rationale*: This service exposes guest reservation data over the public internet with a
single small team behind it, so controls have to hold without anyone remembering to apply
them per route.

### IV. Validated, Documented API Contracts

The API surface is a contract, and it MUST be enforced at the boundary and described
accurately.

- A global `ValidationPipe` MUST run with `whitelist: true` and `forbidNonWhitelisted:
  true` so unknown fields are rejected rather than silently persisted.
- Every request body, query, and route parameter MUST be typed by a DTO with
  `class-validator` decorators. Untyped `@Body()` or `@Query()` is prohibited.
- Every endpoint MUST carry Swagger metadata: tag, summary, and documented response
  statuses including its error cases. The OpenAPI document MUST stay in sync with the code
  in the same PR that changes behavior.
- Errors MUST be returned as Nest HTTP exceptions with a consistent body shape. Raw
  driver, Mongoose, or stack-trace details MUST NOT reach clients.
- Breaking changes to an existing endpoint MUST be introduced as a new versioned path
  rather than by mutating the existing contract in place.

*Rationale*: Validation at the edge is the cheapest place to stop bad data, and an accurate
OpenAPI document is the only contract the API's consumers actually have.

### V. Observability & Performance Budgets

Performance and diagnosability are requirements, not tuning done after complaints.

- Requests MUST be logged as structured records including method, path, status, duration,
  and a correlation id. Logs MUST NOT contain passwords, tokens, or full guest records.
- Every list endpoint MUST be paginated with a bounded default and a hard maximum page
  size. Unbounded `find()` returning a whole collection is prohibited.
- Every field used in a query filter or sort MUST be backed by a MongoDB index, and new
  indexes MUST ship with the change that introduces the query.
- Performance budgets: read endpoints p95 under 300 ms and write endpoints p95 under 500 ms
  measured server-side, excluding cold start. A change that pushes an endpoint past its
  budget MUST be fixed or explicitly waived in the PR.
- Because the service runs on Lambda and Vercel, the MongoDB connection MUST be reused
  across invocations rather than re-established per request, and a health endpoint MUST
  report database reachability.
- N+1 query patterns are prohibited; related data MUST be fetched with aggregation,
  population, or a batched lookup.

*Rationale*: Serverless deployment makes connection churn and unbounded result sets fail
in ways that are invisible locally and expensive in production.

## Security & Data Protection Standards

- Reservation and user records are personal data. They MUST NOT be copied into logs,
  fixtures, analytics, or issue reports. Test data MUST be synthetic.
- `.env*` files MUST remain untracked. If a secret is ever committed, it MUST be rotated
  before the incident is considered closed — removing the file is not sufficient.
- Configuration MUST be validated at startup with an explicit schema; the application MUST
  fail fast on a missing or malformed required variable rather than starting degraded.
- JWTs MUST have a bounded expiry and MUST be signed with an environment-supplied secret of
  at least 32 bytes. Tokens MUST NOT carry sensitive claims beyond identity and role.
- Database credentials MUST be least-privilege per environment, and production credentials
  MUST NOT be usable from a developer machine.
- Deployment artifacts (Docker image, Lambda bundle, Vercel build) MUST NOT embed secrets;
  they are injected at runtime.
- Any change under `src/auth/**` requires explicit security review before merge.

## Development Workflow & Quality Gates

The following gates MUST pass before any change merges to `main`:

1. `npm run lint` — clean, no rule disabled inline without a comment naming the reason.
2. `npm test` — all unit specs pass and coverage thresholds from Principle I hold.
3. `npm run test:e2e` — end-to-end suite passes.
4. `npm run build` — compiles with no TypeScript errors.
5. `npm audit` — no unresolved high or critical advisories.

Additional workflow rules:

- Work happens on a branch and merges by pull request. Direct commits to `main` are
  prohibited except for the initial repository setup.
- Every PR description MUST state which principles the change touches and MUST flag any
  deviation for reviewer attention.
- These gates MUST be enforced by CI, not by memory. Until CI enforces them, the author is
  responsible for running all five locally and stating the result in the PR.
- A PR that adds a dependency MUST justify it; prefer the framework's built-in capability
  over a new package.
- Deployment to production requires a green pipeline on the exact commit being deployed.

## Governance

This constitution supersedes ad-hoc practice and prior convention. Where a habit in the
existing code conflicts with a principle here, the principle wins and the code is treated
as carrying a known defect to be corrected when that area is next touched.

**Amendment procedure**: Amendments are proposed as a pull request that modifies this
document, states the motivation, classifies the version bump, and describes the migration
path for any code the amendment newly puts out of compliance. An amendment merges only when
the repository owner approves it.

**Versioning policy**: This document follows semantic versioning.
- MAJOR — a principle is removed or redefined in a backward-incompatible way, or governance
  itself changes.
- MINOR — a new principle or section is added, or existing guidance is materially expanded.
- PATCH — clarification, wording, or typo fixes that do not change what is required.

**Compliance review**: Every pull request review MUST verify compliance with these
principles; a reviewer MUST block a PR that violates one. Complexity that a principle
discourages MAY be accepted only when the PR states what was tried instead and why it was
insufficient. Existing violations found in untouched code are recorded as issues rather
than silently ignored. This constitution is reviewed at least once every six months, and
`CLAUDE.md` (when present) carries the runtime development guidance that operationalizes
these rules for agents working in this repository.

**Version**: 1.0.0 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-09-07

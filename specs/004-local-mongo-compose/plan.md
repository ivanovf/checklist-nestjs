# Implementation Plan: Local MongoDB via Docker Compose

**Branch**: `004-local-mongo-compose` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-local-mongo-compose/spec.md`

## Summary

A new contributor currently cannot run this service. `.env.local` already describes a
database on their own machine — `localhost:27017`, an authenticating user, the `checklist`
database — but nothing provisions it, and that file is untracked so a fresh clone does not
even have the settings. The alternatives are installing a database engine by hand or
pointing local development at shared data.

This adds a compose file that provisions exactly the database the existing configuration
expects, a committed environment template so a clone has something to copy, and a seed step
that creates the one administrator account without which the API cannot be used at all.

Two discoveries in Phase 0 shaped the design and are worth reading before implementing:
authentication works only because the connection string leaves the database name out of its
path ([research.md](./research.md) R4), and a dot-named environment template would be both
silently ignored and in conflict with the rule that `.env*` files stay untracked, so the
template is `env.example` ([research.md](./research.md) R8).

## Technical Context

**Language/Version**: TypeScript 5.6.3 on Node.js 24.x. The seed script runs under the same
toolchain as the application.

**Primary Dependencies**: no new runtime dependency. The seed script uses the existing
`@nestjs/*`, `mongoose` 8.4 and `bcrypt` already present; the database comes from the
`mongo:7` image, which is infrastructure rather than a package.

**Storage**: MongoDB 7 in a container, data in a Docker-managed named volume. No schema change —
this feature provisions storage the existing `User` schema then uses unmodified.

**Testing**: Jest. The seed script's idempotency is unit-testable against a mocked user
service; the end-to-end suite keeps using `mongodb-memory-server` and must remain unaware of
the local database.

**Target Platform**: developer machines with a container runtime. Nothing here reaches a
deployed environment.

**Project Type**: single-project NestJS service; this feature adds local development tooling
around it.

**Performance Goals**: not applicable to request handling. The relevant budget is SC-001 —
under 5 minutes and no more than 3 commands from clone to a running service. Container
readiness was measured at ~1 second, so the budget is dominated by image pull on first run.

**Constraints**: the container must satisfy the values `.env.local` already declares rather
than introduce its own; no credential literal may be committed; the test suite must stay
independent; nothing may become required for a deployment.

**Scale/Scope**: one developer at a time on one machine. Roughly 3 files added, 3 modified.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

| Principle | Gate | Pre-Phase-0 | Post-Phase-1 |
|---|---|---|---|
| I. Test-First Discipline | New behaviour lands with failing-first tests; coverage floors hold | PASS (planned) | **PASS** — the seed script is behaviour, not configuration, and gets real tests for its idempotency and its refusal to weaken an existing account |
| II. Layered Architecture | Services own business rules; no raw model writes bypassing them | **AT RISK** — a database-side init script cannot hash a password and would duplicate the rule | **PASS** — seeding goes through `UsersService`, so hashing, schema defaults and the `Role` enum are reused rather than reimplemented ([research.md](./research.md) R7) |
| III. Secure By Default | No credential literals in source; synthetic test data | **AT RISK** — compose files habitually carry a hardcoded password | **PASS** — credentials interpolate from `.env.local`; the committed template holds placeholders only |
| IV. Validated, Documented Contracts | API surface unchanged | PASS | **PASS** — no endpoint is added or altered |
| V. Observability & Performance | Connection reuse; health reporting | PASS | **PASS** — unchanged; the health route added by feature 002 becomes the way a developer confirms the database is reachable |
| Security & Data Protection | `.env*` untracked; test data synthetic | PASS | **PASS** — the committed template is `env.example`, which does not match `.env*`, so no exception to the rule is needed; the seeded account is synthetic |
| Workflow & Quality Gates | lint, test, e2e, build, audit pass; branch and PR | PASS | **PASS** for the first four; `npm audit` carries pre-existing advisories unchanged by this feature |

**Gate result**: proceed. Both "at risk" entries were design decisions rather than
discovered violations, and Phase 0 resolved each in the direction the constitution requires.

## Project Structure

### Documentation (this feature)

```text
specs/004-local-mongo-compose/
├── plan.md              # This file
├── research.md          # Phase 0 — 10 decisions, the two critical ones verified live
├── data-model.md        # Phase 1 — configuration and the seeded account
├── quickstart.md        # Phase 1 — validation guide
├── contracts/           # Phase 1
│   ├── local-environment.md
│   └── seed-account.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16)
└── tasks.md             # Phase 2 — created by /speckit-tasks, NOT by this command
```

### Source Code (repository root)

```text
compose.yaml                         # ADDED — the mongo service, credentials interpolated
env.example                          # ADDED — committed template; placeholders only.
                                     #   No leading dot: ".env*" must stay untracked

src/users/
├── dev-admin-seed.ts                # ADDED — idempotent, goes through UsersService
└── dev-admin-seed.spec.ts           # ADDED — idempotency and no-weakening tests

scripts/
└── seed-dev-admin.ts                # ADDED — thin runner; boots the app context

package.json                         # MODIFIED — db:up, db:down, db:reset, db:seed
database.module.ts                   # MODIFIED — comment only, recording the authSource
                                     #   constraint at the URI construction site
README.md                            # MODIFIED — the documented setup path
# (database files live in a named volume, outside the working tree entirely)
```

**Structure Decision**: The compose file goes at the repository root rather than under
`docker/`, so `docker compose` finds it with no `-f` flag. The existing `docker/Dockerfile`
is left untouched — it targets a serverless deployment platform and has nothing to do with
local development. (It also pins Node 18 against the project's declared 24.x, which is worth
correcting but belongs to its own change.)

The seed **runner** sits in `scripts/` beside `audit-user-roles.ts`, which established that
convention for operational scripts that boot application code outside the HTTP path. Its
**logic** does not: jest's `rootDir` is `src`, so a spec under `scripts/` is never discovered
and never runs. Keeping the logic in `src/users/` is what makes it testable at all, and it
also places it beside the service that owns user creation.

## Phase Plan

**Phase 0 — Research** *(complete)*: [research.md](./research.md). Ten decisions. The two
that could have sunk the implementation — authentication against a container-initialised
user, and whether a committed template is even possible — were verified against a live
container and the actual ignore rules.

**Phase 1 — Design & Contracts** *(complete)*: [data-model.md](./data-model.md),
[contracts/](./contracts/), [quickstart.md](./quickstart.md).

**Phase 2 — Tasks**: not produced by this command. Run `/speckit-tasks`.

Suggested implementation ordering:

1. **US1 — the database exists** (`env.example`, `compose.yaml`, the package scripts). Verifiable on its own: start it, run the service, watch `/api/health`
   report the data store as available.
2. **US2 — the environment is usable** (seed script and its tests). Must follow US1, since
   there is nothing to seed before it, and must not be deferred — US1 alone yields an
   environment that starts cleanly and refuses every useful request.
3. **US3 — persistence and reset** (reset script, the `git status` check). Largely a
   consequence of US1's bind mount; this step is the test that pins it.
4. **Documentation** (README, and the `database.module.ts` comment recording the authSource
   constraint).

## Requirements Traceability

| Requirement | Where it is handled |
|---|---|
| FR-001 (single command) | npm scripts — [research.md](./research.md) R9, [local-environment.md](./contracts/local-environment.md) |
| FR-002 (matches existing config) | Interpolation from `.env.local` — [research.md](./research.md) R3, verified in R4 |
| FR-003 (repeat start is safe) | `db:up` idempotency row — [local-environment.md](./contracts/local-environment.md) |
| FR-004 (persistence) | Bind mount — [research.md](./research.md) R5 |
| FR-005 (reset) | `db:reset` — [local-environment.md](./contracts/local-environment.md) |
| FR-006 (data not committed) | Named volume keeps database files outside the working tree; `git status` check in [quickstart.md](./quickstart.md) Scenario 4 |
| FR-007 (sign in on a fresh database) | [seed-account.md](./contracts/seed-account.md); [quickstart.md](./quickstart.md) Scenario 2 |
| FR-008 (seeded account is an administrator) | Role from the `Role` enum — [seed-account.md](./contracts/seed-account.md); asserted by Scenario 2's admin-route call |
| FR-009 (idempotent seeding) | [seed-account.md](./contracts/seed-account.md); [quickstart.md](./quickstart.md) Scenario 3 |
| FR-010 (synthetic, not a deployed credential) | [seed-account.md](./contracts/seed-account.md) constraints |
| FR-011 (password never readable) | Seeding through `UsersService` — [research.md](./research.md) R7 |
| FR-012 (not required for deployment) | [local-environment.md](./contracts/local-environment.md) boundaries; [quickstart.md](./quickstart.md) Scenario 6 |
| FR-013 (test suite independent) | [research.md](./research.md) R10 — already true; must not regress |
| FR-014 (no deployed credential committed) | Interpolation, placeholders only — [research.md](./research.md) R3, R8; verified by the grep check in [quickstart.md](./quickstart.md) Scenario 6 |
| FR-015 (documented ordering and symptom) | [local-environment.md](./contracts/local-environment.md); rehearsed in [quickstart.md](./quickstart.md) Scenario 5 |

Success criteria SC-001 through SC-008 are each exercised by a numbered quickstart scenario.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| A seed script that writes an administrator account | The API cannot bootstrap its own first administrator: creating an account requires one, and signing in requires an existing account. Without this the feature delivers a database nobody can use. | Documenting manual database insertion was rejected — it puts a bcrypt hash in a README and breaks the moment hashing changes. A database-side init script cannot hash at all (R7). |

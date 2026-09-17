# Implementation Plan: Vercel Deployment Configuration

**Branch**: `002-fix-vercel-deploy` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-fix-vercel-deploy/spec.md`

## Summary

Publishing this service currently fails: the hosting platform rejects the build because it
finds no directory of static files to serve, which an API-only project never produces. The
fix is to publish one deliberately minimal directory and to declare the runtime version
once so the repository and the hosting project stop disagreeing.

Because this feature is what first puts the service on the public internet, it also
activates the three protections the constitution requires of any deployed environment —
an explicit cross-origin allowlist, protective response headers, and rate limiting on
authentication — adds a health route that reports whether the data store is genuinely
reachable, and withdraws the browsable API documentation page from deployed environments.

Two constitution gaps are knowingly carried rather than closed: strict request-body
validation (recorded in the spec) and the fact that in-process rate-limit counters do not
constrain a horizontally scaled deployment (see [research.md](./research.md) R5). Both are
tracked in Complexity Tracking below.

## Technical Context

**Language/Version**: TypeScript 5.6.3 on Node.js 24.x (raised from 22.x per
[research.md](./research.md) R2)

**Primary Dependencies**: NestJS 10 (`@nestjs/common`, `@nestjs/core`,
`@nestjs/platform-express`), Mongoose 8.4 via `@nestjs/mongoose` 10, `@nestjs/config` 3.2
with Joi validation, `helmet` 8.3 and `@nestjs/throttler` 6.5 (both already in
`package.json`, both currently unwired), `@nestjs/swagger` 7.3

**Storage**: MongoDB Atlas, reached over `mongodb+srv`. No schema or data change in this
feature; the connection is only *read* for health reporting.

**Testing**: Jest for unit specs; Jest plus `supertest` against `mongodb-memory-server` for
end-to-end. Coverage thresholds: 80% overall, 90% for `src/auth/**`.

**Target Platform**: Vercel serverless functions (Node 24 runtime), published from a linked
project. The same code also runs as a long-lived listener locally and in the existing
container/Lambda targets, so nothing may be bound to the serverless path alone.

**Project Type**: Single-project web service (NestJS monolith, no frontend in this repo)

**Performance Goals**: Inherited from the constitution — reads p95 under 300 ms, writes p95
under 500 ms, excluding cold start. This feature adds no request-path work beyond one
in-memory connection-state read on a single new route.

**Constraints**: The database connection must be established once per instance and reused
(already implemented in `src/serverless.ts`; this feature must not regress it). No secrets
in committed configuration. The published static surface must contain only files we
deliberately place there.

**Scale/Scope**: Small private service, single team. Roughly 5 source files touched, 3
added, 2 configuration files changed.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

| Principle | Gate | Pre-Phase-0 | Post-Phase-1 |
|---|---|---|---|
| I. Test-First Discipline | New behaviour lands with failing-first tests; no `should be defined` stand-ins; coverage floors hold | PASS (planned) | **PASS** — health module, CORS parsing, docs gating and throttling each get real assertions; see [quickstart.md](./quickstart.md) |
| II. Layered Architecture | Controllers stay HTTP-only; services own rules; no `any`; no raw documents returned | PASS | **PASS** — health controller delegates to a service that reads connection state; no Mongoose document is returned anywhere |
| III. Secure By Default | Explicit CORS allowlist per environment; headers and auth rate limiting in every deployed environment; no literal secrets; public routes explicitly marked | **FAIL at entry** — blanket `enableCors()`, helmet and throttler unwired | **PASS with one documented limitation** — allowlist, headers and auth throttling all wired; rate-limit scope constrained by in-memory storage (R5), recorded below |
| IV. Validated, Documented Contracts | Global validation rejects unknown fields; every endpoint carries Swagger metadata; consistent error shape; no driver detail to clients | **FAIL at entry** — validation does not reject unknown fields | **PARTIAL, justified** — new health route carries metadata and leaks no driver detail; strict validation deliberately deferred, recorded below |
| V. Observability & Performance | Connection reused across invocations; health endpoint reports database reachability; budgets respected | **FAIL at entry** — no health endpoint | **PASS** — health route added; connection reuse preserved; structured request logging remains absent (recorded below) |
| Security & Data Protection | `.env*` untracked; config validated at startup, failing fast; deployment artifacts carry no secrets | PASS | **PASS** — `CORS_ORIGINS` joins the validated schema as required-when-deployed |
| Workflow & Quality Gates | lint, test, e2e, build, audit all pass; work on a branch via PR | PASS | **PASS** for the first four; `npm audit` carries pre-existing unresolved advisories, unchanged by this feature and tracked separately |

**Gate result**: proceed. The three entry-state failures under III and V are precisely what
this feature exists to correct. The two residual items are justified in Complexity
Tracking rather than reinterpreted away.

## Project Structure

### Documentation (this feature)

```text
specs/002-fix-vercel-deploy/
├── plan.md              # This file
├── research.md          # Phase 0 output — 8 resolved decisions
├── data-model.md        # Phase 1 output — configuration and response shapes
├── quickstart.md        # Phase 1 output — validation guide
├── contracts/           # Phase 1 output
│   ├── health-endpoint.md
│   ├── deployment-configuration.md
│   └── transport-security.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16)
└── tasks.md             # Phase 2 — created by /speckit-tasks, NOT by this command
```

### Source Code (repository root)

```text
public/
└── robots.txt                       # ADDED — the only deliberately published static file

api/
└── index.js                         # unchanged — serverless entry shim

src/
├── bootstrap.ts                     # MODIFIED — helmet, CORS allowlist, docs gating + /docs CSP override
├── main.ts                          # unchanged — port listener
├── serverless.ts                    # unchanged — handler; connection reuse preserved
├── app.module.ts                    # MODIFIED — register HealthModule, ThrottlerModule
├── config/
│   └── env.validation.ts            # MODIFIED — CORS_ORIGINS, required when deployed
├── health/                          # ADDED
│   ├── health.module.ts
│   ├── health.controller.ts
│   ├── health.controller.spec.ts
│   ├── health.service.ts
│   └── health.service.spec.ts
└── auth/
    └── controllers/
        └── auth.controller.ts       # MODIFIED — throttler guard + tight limit on login

test/
└── security/
    └── transport-security.e2e-spec.ts   # ADDED — headers, CORS, docs withdrawal

vercel.json                          # MODIFIED — outputDirectory
package.json                         # MODIFIED — engines 24.x
.github/workflows/ci.yml             # MODIFIED — derives runtime from package.json
```

**Structure Decision**: The existing single-project NestJS layout is kept unchanged. The
one new feature module (`src/health/`) follows the established per-domain module convention
(module + controller + service + colocated specs), matching `src/activity/`,
`src/items/` and the rest.

The most important structural constraint is that transport concerns go into
`src/bootstrap.ts` and nowhere else. That file exists specifically because the service has
two entry points — the port listener and the serverless handler — and anything applied to
only one of them silently diverges between local and deployed behaviour. Helmet, the CORS
allowlist and the documentation gating are all transport concerns and therefore all belong
there.

## Phase Plan

**Phase 0 — Research** *(complete)*: [research.md](./research.md). Eight decisions, each
verified against the installed dependency set rather than assumed. No NEEDS CLARIFICATION
items remain.

**Phase 1 — Design & Contracts** *(complete)*: [data-model.md](./data-model.md),
[contracts/](./contracts/), [quickstart.md](./quickstart.md).

**Phase 2 — Tasks**: not produced by this command. Run `/speckit-tasks`.

Suggested implementation ordering, since User Story 1 is independently shippable and the
deploy is currently broken:

1. **US1 + US3 — unblock the deploy** (`public/robots.txt`, `outputDirectory`, Node 24 in
   `engines` and CI). Smallest possible change that publishes the service. Verifiable by a
   successful deploy.
2. **US2 — deployed-environment protections** (CORS allowlist and the `CORS_ORIGINS`
   schema entry, helmet, auth throttling, docs withdrawal). Must land before the deployment
   is treated as production-ready, since without it the published service is out of
   compliance with Constitution III.
3. **Health route** (serves US1's acceptance scenarios 2 and 3). Sequenced after the
   unblock because the deploy has to succeed before a health check on it means anything.
4. **US4 — exposure verification**. Largely proven by the `outputDirectory` choice in step
   1; this step is the test that pins it.

Splitting step 1 from step 2 is available if the deploy is needed urgently, but shipping
step 1 alone to production means knowingly publishing without the required protections.

## Requirements Traceability

Every functional requirement maps to somewhere concrete. The four marked *already
satisfied* need no new code — they are properties the service has today, listed here so
they are consciously preserved rather than assumed, and so a coverage check does not read
them as gaps.

| Requirement | Where it is handled | Kind |
|---|---|---|
| FR-001 | `outputDirectory` → `public/` — [research.md](./research.md) R1, [deployment-configuration.md](./contracts/deployment-configuration.md) | New |
| FR-002 | Rewrite routes all non-static paths to the function | Already satisfied — must not regress |
| FR-002a | Documentation gating — [transport-security.md](./contracts/transport-security.md) §4 | New |
| FR-003 | Only `public/` is published — [deployment-configuration.md](./contracts/deployment-configuration.md) | New |
| FR-004 | Unknown paths fall through the rewrite to the application, which answers not-found. Verified today: `/api/reservations` returns 404 from the framework, not the platform. | **Already satisfied** — regression-tested by quickstart Scenario 6 |
| FR-005, FR-006, FR-007 | Single `engines` declaration; CI matches — [research.md](./research.md) R2 | New |
| FR-008 | `vercel.json` carries no secret; all values injected at runtime. Nothing in this feature adds one — the new `CORS_ORIGINS` is an environment value, not a committed one. | **Already satisfied** — must not regress |
| FR-009 | Connection cached on the module in `src/serverless.ts` so a warm instance reuses its pool. This feature only *reads* connection state for health; it must not open a second connection. | **Already satisfied** — the health design in [research.md](./research.md) R6 reads state rather than connecting, specifically to preserve this |
| FR-010 | Existing Joi startup validation, extended with `CORS_ORIGINS` — [data-model.md](./data-model.md) | Extended |
| FR-011 | The four CI gates (lint, test+coverage, e2e, build) already gate the branch; quickstart lists them as the pre-deploy check | **Already satisfied** — process gate, no code |
| FR-012, FR-013 | CORS allowlist — [transport-security.md](./contracts/transport-security.md) §1 | New |
| FR-014 | Helmet in shared transport setup — [transport-security.md](./contracts/transport-security.md) §2 | New |
| FR-015 | Auth throttling — [transport-security.md](./contracts/transport-security.md) §3 | New, **partial** (see Complexity Tracking) |
| FR-016, FR-017 | Health route — [health-endpoint.md](./contracts/health-endpoint.md) | New |

Success criteria SC-001 through SC-010 are all observable from outside the service and are
covered by the scenarios in [quickstart.md](./quickstart.md); SC-005 and SC-006 are read
from the deploy log rather than tested in the suite, since neither is observable from
inside the application.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Constitution IV — global validation still does not reject unknown request fields | Closing it changes the contract of every endpoint and needs a field-by-field sweep of each request shape. Bundling that into the change that unblocks a broken deploy would make neither shippable in one pass. Decision recorded in the spec's Clarifications and Known Deviations. | Enabling it now was rejected as unbounded regression risk across every route. Silently stripping unknown fields instead was rejected because callers would lose data with no error — a quieter failure than the one being fixed. Belongs in its own feature. |
| Constitution III — auth rate limiting is per-instance, not deployment-wide | The installed throttler stores counters in process memory. On a serverless platform, instances scale out and each holds its own counter, so the limit blunts naive repeated attempts against a warm instance but does not bound attempts across the deployment. See [research.md](./research.md) R5. | A shared Redis-backed store is the correct answer but provisions external infrastructure this feature has no mandate for. Platform edge rate limiting is configured outside the repository and so cannot be covered by the project's own test suite. Shipping nothing was rejected as strictly worse than a partial control. |
| Constitution V — no structured request logging with correlation ids | Genuinely absent, and not addressed here. Adding request-scoped logging touches every request and pairs naturally with the deferred validation work. | Bolting it onto a deployment fix was rejected for the same reason as the validation gap: it is cross-cutting request-path work, not deployment configuration. Recommend one follow-up feature covering both. |

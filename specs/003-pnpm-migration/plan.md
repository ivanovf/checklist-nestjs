# Implementation Plan: Switch the Package Manager from npm to pnpm

**Branch**: `003-pnpm-migration` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-pnpm-migration/spec.md`

## Summary

Replace npm with pnpm 12.5.1 for local development, CI and the Vercel deploy. Delete the
dead Lambda, Serverless and Heroku targets. Then clear every high and critical advisory, so
CI can enforce all five constitution gates, including the dependency audit that it skips
today.

Every approach in this plan was tested before it was written down. A scratch copy of the
repository, with the exact final dependency tree, passes all five gates:

- lint;
- unit tests: 73 of 73, coverage identical to the npm baseline;
- e2e: 126 of 126;
- build;
- `pnpm audit --audit-level high`: 0 high, 0 critical, down from 71 advisories across 23
  packages.

That result needs **no NestJS runtime major upgrade** and **no accepted advisories**. The
two major upgrades are install and build tooling only (`bcrypt` 6 and `@nestjs/cli` 11).
Everything else is a same-major bump or an override scoped to one major. See
[research.md](./research.md).

The work lands in a fixed order, so any regression can be traced to one step:

1. pnpm checkpoint (versions identical to npm);
2. legacy removal;
3. security upgrades;
4. CI, Vercel and docs.

## Technical Context

**Language/Version**: TypeScript on Node.js 24.x. TypeScript resolves to 5.9.3 (was
5.6.3), because `@nestjs/cli@11` depends on exactly 5.9.3; the declared range `^5.4.5` is
unchanged.

**Primary Dependencies**: pnpm 12.5.1 via Corepack (new). NestJS 10.4.x (stays on 10),
Mongoose 8.24.x (was 8.4), bcrypt 6 (was 5), `@nestjs/cli` 11 (was 10).

**Storage**: MongoDB Atlas. No schema or data change.

**Testing**: Jest 29 unit suites and Jest plus supertest e2e against `mongodb-memory-server`
(`--runInBand`). The existing suites, including `test/docs/`, are the regression evidence
for FR-018. No new application tests, because no application behaviour changes.

**Target Platform**: Vercel serverless (Node 24), the only deploy target after this
feature. Also local macOS and Linux dev machines, and GitHub Actions `ubuntu-latest`.

**Project Type**: Single-project NestJS web service.

**Performance Goals**: The function bundle size and cold start on Vercel stay within 10% of
the last npm-built deployment (SC-007). Constitution request budgets are unaffected.

**Constraints**:

- The compiled entry must stay at `dist/src/serverless.js`.
- `vercel.json` stays the source of truth for install and build.
- Install scripts run only for allowlisted packages.
- No project-wide hoisting.

**Scale/Scope**:

- About 10 files removed and 6 config files changed.
- 3 files added: `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`.
- 4 docs updated: README, CLAUDE.md, the constitution, and a script comment.
- 0 application source files changed (expected).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Rule | Assessment | Status |
|---|---|---|
| **I. Test-First** | No application behaviour is added or changed, so there is no new behaviour to test first. The existing unit, e2e and docs suites are the regression gate for every upgrade step, and FR-018 forbids weakening them. Coverage floors: `src/auth` thresholds hold. Overall coverage is 71.78%, the same on npm and pnpm (see Complexity Tracking) | ✅ Pass (pre-existing deviation noted) |
| **II. Layered Architecture** | No change to controllers, services or models. No `any` introduced | ✅ Pass |
| **III. Secure By Default** | Improves it. Removes 49 high and critical advisories (71 → 0 with the upgrades). Install scripts are denied by default, with an explicit allowlist that CI enforces. `.npmrc` holds no secrets. The audit gate moves from `npm audit` to `pnpm audit`, and the accepted-advisory record is `auditConfig.ignoreGhsas` with a justification and review date on each entry, as Principle III requires | ✅ Pass |
| **IV. Validated, Documented API Contracts** | The HTTP contract is unchanged (FR-018). `test/docs/` passes unmodified | ✅ Pass |
| **V. Observability & Performance** | Connection reuse in `src/serverless.ts` is untouched, and the health route is unchanged. SC-007 guards bundle size and cold start | ✅ Pass |
| **Security & Data Protection** | No deployment artifact embeds secrets. The Docker and Lambda artifacts that the "deployment artifacts" rule names are removed. No `src/auth/**` change, so no auth security review is triggered | ✅ Pass |
| **Workflow & Quality Gates** | Gates 1–5 are renamed to pnpm commands. **CI now enforces all five** (today it enforces four), which closes the "enforced by CI, not by memory" gap. One dependency is added: `dotenv`, which was already imported by `scripts/audit-user-roles.ts` and worked only through npm hoisting. That is the justification the gate rule asks for. The PR states the principles touched | ✅ Pass |
| **Governance** | The constitution text changes as a **PATCH** amendment, from 1.0.0 to 1.0.1: gate commands say pnpm, "Lambda, Vercel" becomes "Vercel", and the "Docker image, Lambda bundle" wording goes. What is required does not change. It is proposed in the same PR and needs owner approval | ✅ Pass |

**Post-design re-check (after Phase 1)**: No new violations. The design adds no runtime
dependency beyond declaring `dotenv` (a devDependency). It leaves the NestJS runtime on
major 10 and accepts no advisory. It also removes a whole class of supply-chain exposure
(unreviewed install scripts). ✅

## Project Structure

### Documentation (this feature)

```text
specs/003-pnpm-migration/
├── spec.md
├── plan.md                          # this file
├── research.md                      # R1–R10, all measured
├── data-model.md                    # config files as entities
├── quickstart.md                    # runnable validation
├── contracts/
│   └── developer-interface.md       # HTTP unchanged + command surface
├── checklists/requirements.md
└── tasks.md                         # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
package.json              # packageManager, engines, scripts trimmed, deps per R3/R9
pnpm-lock.yaml            # NEW (checkpoint → final)
pnpm-workspace.yaml       # NEW: allowBuilds, overrides, auditConfig
.npmrc                    # NEW: engine-strict=true
package-lock.json         # DELETED
vercel.json               # installCommand only
.github/workflows/ci.yml  # corepack, store cache, 5 gates
.gitignore                # + package-lock.json, yarn.lock
.prettierignore           # package-lock.json → pnpm-lock.yaml
README.md                 # pnpm commands, migration note
CLAUDE.md                 # pnpm commands, TS 5.9, Vercel-only
.specify/memory/constitution.md   # PATCH 1.0.1
scripts/audit-user-roles.ts       # usage comment: pnpm exec ts-node

# DELETED (legacy targets)
docker/Dockerfile  .dockerignore  serverless.yml  .serverless/
lambda.ts  tsconfig.lambda.json  Procfile  static.json

# UNCHANGED, but verified
api/index.js  database.module.ts  src/**  test/**  nest-cli.json
```

**Structure Decision**: Single project. No application directories change. The feature
touches only tooling, configuration and documentation at the repository root.

## Delivery Order

Each step is one or more commits, and all available gates pass at the end of each step.

1. **Checkpoint.** Add `packageManager`, run `pnpm import`, delete `package-lock.json`,
   add `pnpm-workspace.yaml` (`allowBuilds` only), `.npmrc` and `engines`, declare
   `dotenv`, and drop `prebuild`. Versions are identical to npm (quickstart §2). Gates 1–4
   pass. The audit is expected to fail at this point.
2. **Legacy removal** (FR-013, FR-015). Delete the files and scripts, remove the 7
   dependencies, and confirm `dist/src/serverless.js`.
3. **Security upgrades** (FR-017), one commit per group:
   1. same-major runtime bumps (mongoose, @nestjs/* 10.4.22, class-validator, supertest);
   2. bcrypt 6;
   3. @nestjs/cli and @nestjs/schematics 11;
   4. overrides.

   After 3.4 the audit gate passes.
4. **CI** (FR-009). The pnpm workflow with the audit gate.
5. **Vercel** (FR-007, FR-008). `installCommand`, then the preview checks (quickstart §5).
6. **Docs and constitution** (FR-012, FR-014, FR-016).

## Risks

| Risk | Mitigation |
|---|---|
| The Vercel build image refuses `corepack enable` | Fallback in research R4 (`ENABLE_EXPERIMENTAL_COREPACK=1`). The preview deploy catches it before merge |
| Vercel's function tracer misses a file in pnpm's symlinked store | Preview cold-start check for `Cannot find module` (quickstart §5). Locally, the shim already loads the whole app through the pnpm layout |
| A future dependency brings an unlisted install script | Intended: CI fails with `ERR_PNPM_IGNORED_BUILDS` until someone decides |
| An override hides a real incompatibility | Every override stays within one major, and the full e2e and docs suites run after the override commit |

## Complexity Tracking

| Deviation | Why Carried | Why Not Fixed Here |
|---|---|---|
| Overall unit coverage is 71.78%, below Principle I's 80% floor (only the `src/auth` thresholds are enforced in the Jest config) | It already exists on `main` under npm, and this feature measured it at exactly the same value under pnpm, so the feature neither causes nor worsens it | Raising coverage means writing application tests, which is unrelated to a package-manager switch. It should be recorded as an issue per the constitution's governance rule ("existing violations … recorded as issues") |

# Feature Specification: Switch the Package Manager from npm to pnpm

**Feature Branch**: `003-pnpm-migration`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "Want to change npm for pnpm. Consider the modifications for vercel, and locally."

## Clarifications

### Session 2026-09-21

- Q: Should the legacy deployment targets (AWS Lambda Docker image, Serverless Framework
  config, Heroku Procfile and build hook) be migrated to pnpm, left on npm, or removed?
  → A: Remove them as dead configuration. Vercel is the only live deploy path, and once
  the npm lockfile is gone these targets would be broken anyway. Removing them costs less
  than migrating config that is never deployed.
- Q: Should CI also run the dependency audit, so all five constitution gates run in CI and
  not just four? → A: Yes. CI adds an audit step that fails on high or critical
  advisories, which closes the gap with the constitution's "enforced by CI, not by memory"
  rule.
- Q: How should the switch deal with the high and critical advisories that remain after
  the legacy dependencies are removed (27 under npm today, including direct dependencies
  `mongoose`, `@nestjs/platform-express`, and `@nestjs/cli`)? → A: Upgrade dependencies in
  this feature until none remain. The package manager switch lands first with versions
  preserved; the upgrades follow as separate steps. A high or critical advisory may be
  accepted only when no patched version exists anywhere in its dependency chain.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A developer installs, runs, and verifies the project with pnpm (Priority: P1)

A maintainer with a fresh clone installs dependencies with pnpm, starts the API locally,
and runs the five quality gates (lint, unit tests, end-to-end tests, build, dependency
audit). Every step gives the same result it gives with npm today. The project states which
pnpm version it expects, so two machines resolve the same dependency tree.

Today the project installs with npm and records its dependency tree in an npm lockfile.
After the switch, the pnpm lockfile is the only record of that tree. The npm lockfile is
removed so the two cannot drift apart.

**Why this priority**: Local development is where every change starts. If the gates do not
pass under pnpm, no change can be verified, and nothing else in this feature can ship.

**Independent Test**: In a fresh clone with no installed dependencies, install with pnpm,
then run each of the five gates and start the API. Each gate passes, and the health route
answers once the local database is up.

**Acceptance Scenarios**:

1. **Given** a fresh clone, **When** the developer installs dependencies with pnpm, **Then**
   the install completes without errors, and dependencies that compile native code or
   download binaries (password hashing, the in-memory test database) are built and usable.
2. **Given** installed dependencies, **When** the developer runs lint, unit tests, end-to-end
   tests, and build, **Then** each gate passes with the same results and coverage it had
   under npm.
3. **Given** installed dependencies, **When** the developer runs the dependency audit with
   pnpm, **Then** it reports no unresolved high or critical advisories, or lists each
   accepted one with its recorded justification.
4. **Given** installed dependencies, **When** the developer starts the API in watch mode,
   **Then** it serves on the usual local address and the health route reports the database
   as reachable.
5. **Given** a developer who runs an npm install out of habit, **When** the install starts,
   **Then** it stops with a message telling them to use pnpm, and no npm lockfile is
   created.

---

### User Story 2 - A Vercel deploy installs with pnpm and the deployed API behaves the same (Priority: P1)

The maintainer pushes the branch. Vercel installs dependencies with pnpm at the pinned
version, builds the service, and publishes it. On the deployed URL, the service behaves
exactly as it did under npm: the health route reports the database as reachable, and
protected routes refuse callers who present no credential.

**Why this priority**: Production runs on Vercel. A package manager switch that works
locally but breaks the deploy is a regression for real users. This story shares P1 with
Story 1 because the feature is only complete when both hold.

**Independent Test**: Deploy the branch to a Vercel preview. Read the build log to confirm
that pnpm ran the install at the pinned version. Then call the health route and one
protected route on the preview URL.

**Acceptance Scenarios**:

1. **Given** the branch is pushed, **When** Vercel builds it, **Then** the build log shows the
   install ran with pnpm at the version the project pins, and the build completes.
2. **Given** a successful preview deploy, **When** a caller requests the health route,
   **Then** it answers success and reports the database as reachable.
3. **Given** a successful preview deploy, **When** a caller requests a protected route
   without a credential, **Then** it is refused exactly as before the switch.
4. **Given** a successful preview deploy, **When** the first request reaches a cold
   instance, **Then** the function starts without a missing-module error. This is the case
   where a dependency tree laid out differently could leave a runtime file out of the
   deployed bundle.

---

### User Story 3 - Continuous integration and documentation use pnpm (Priority: P2)

Every pull request runs the quality gates in CI with pnpm, using the same pinned version
and the pnpm lockfile, so a green pipeline certifies the same dependency tree that
developers and Vercel install. Every instruction a contributor reads (README, agent
guidance, the constitution's gate list, script usage comments) names pnpm commands.

**Why this priority**: CI and documentation do not block a working deploy, but if they
still say npm, the next contributor will reintroduce an npm lockfile, or CI will certify a
tree that nobody deploys.

**Independent Test**: Open a pull request from the branch and confirm that CI installs with
pnpm from the lockfile and that all gates pass. Search the tracked files for npm and npx
commands and find none outside intentional references (for example, registry badge links).

**Acceptance Scenarios**:

1. **Given** a pull request, **When** CI runs, **Then** it installs with pnpm from the frozen
   lockfile, and the install fails if the lockfile disagrees with the declared dependencies.
2. **Given** a pull request, **When** CI runs, **Then** it runs all five gates, including the
   dependency audit, and a high or critical advisory with no recorded acceptance fails the
   pipeline.
3. **Given** a second CI run with unchanged dependencies, **When** it installs, **Then** it
   reuses the cached package store instead of downloading every package again.
4. **Given** the repository after the switch, **When** a contributor follows the README or
   the agent guidance, **Then** every command they run is a pnpm command, and the commands
   work as written.
5. **Given** the constitution's quality gate list, **When** it is read after the switch,
   **Then** the gates name pnpm commands, and the change is recorded as a PATCH amendment.

---

### User Story 4 - The dependency tree has no known high or critical vulnerabilities (Priority: P2)

Once the switch is in place, the maintainer upgrades dependencies until the audit is clean
at the high and critical levels, so the new CI audit gate passes on real advisories rather
than accepted exceptions. The API behaves exactly as before the upgrades.

**Why this priority**: Without it, the CI audit gate from Story 3 fails on its first run.
It follows Stories 1 and 2, because the upgrades must happen on a working pnpm baseline
where every change can be traced.

**Independent Test**: Run the dependency audit and confirm it reports no high or critical
advisories other than accepted ones. Then run the full gate suite and the preview deploy
checks from Story 2, and confirm the results match the pre-upgrade baseline.

**Acceptance Scenarios**:

1. **Given** the pnpm checkpoint lockfile, **When** the upgrades are applied, **Then** the
   audit reports zero high and zero critical advisories that are not accepted.
2. **Given** the upgraded tree, **When** the unit, e2e, and API-documentation tests run,
   **Then** they all pass without any test being weakened, skipped, or removed.
3. **Given** an advisory with no patched version anywhere in its chain, **When** it is
   accepted, **Then** the repository records its justification and review date, and CI
   passes. A newly introduced advisory still fails CI.

---

### Edge Cases

- **Undeclared dependencies**: npm's flat install lets code import a package that it never
  declares, because some other dependency happened to install it. pnpm does not allow
  this. Any such import must fail during the switch, and the fix is to declare the package,
  not to loosen pnpm's isolation project-wide.
- **Blocked install scripts**: Recent pnpm versions do not run dependency install scripts
  unless the project explicitly allows them. If the password hashing module or the
  in-memory test database is not allowed, the install appears to succeed, and the failure
  only surfaces at runtime or in e2e tests. The allowed set must be explicit and as small as
  possible.
- **Vercel picking a pnpm version**: Vercel infers the pnpm version from the lockfile format
  unless the project pins one. The deployed build must use the pinned version, not an
  inferred one.
- **Stale build cache on Vercel**: The first deploy after the switch may restore an npm-era
  `node_modules` from cache. The deploy must still produce a correct bundle.
- **Linked dependency layout in the function bundle**: pnpm links packages into a shared
  store instead of copying them flat. The deployed function must still contain every file
  it loads at runtime.
- **Stale local installs**: A developer who pulls the change onto an existing npm-installed
  `node_modules` must get a working setup after a documented clean reinstall.
- **Removing a still-used legacy file**: Some root-level files look like Lambda leftovers
  but the application still imports them (the database module). Removing one of those, or
  a dependency that `src/` still imports, must fail the build or the tests before it can
  merge.
- **Version drift mixed with upgrades**: If the package manager switch and the security
  upgrades land in one step, any behaviour change can't be traced to its cause. The switch
  must first land with versions preserved and all gates except the audit passing. The
  upgrades come after it as separate, individually revertible steps.
- **An upgrade needs a new major version**: Some fixes only exist in a newer major version,
  for example of the web framework or its CLI. Such an upgrade is allowed, but its breaking
  changes must be handled and the full gate suite must pass after it. It must not quietly
  change an API contract. Any change to an endpoint's behaviour is a defect.
- **No fix exists yet**: An advisory may have no patched release anywhere in the dependency
  chain. Forcing a patched version of the transitive package is the first remedy. If no
  patched version exists at all, the advisory may be accepted with a justification and a
  review date. This is the only case in which a high or critical advisory may be accepted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST declare pnpm as its package manager and pin an exact pnpm
  version in a place that local tooling, CI, and Vercel all read.
- **FR-002**: The repository MUST contain a pnpm lockfile generated from the current
  dependency declarations and MUST NOT contain an npm lockfile.
- **FR-003**: The first pnpm lockfile MUST resolve each dependency to the same version the
  npm lockfile resolved, where the declared range allows it. That lockfile MUST be committed
  as a checkpoint before any upgrade. Dependency versions change only through the security
  upgrades in FR-017, and the pull request MUST list each changed version.
- **FR-004**: An attempt to install dependencies with npm (or yarn) MUST fail fast with a
  message that directs the developer to pnpm.
- **FR-005**: Dependencies that must run install scripts (native builds, binary downloads)
  MUST be named in an explicit allowlist. All other dependency install scripts MUST stay
  disabled.
- **FR-006**: Every package the code imports MUST be declared as a direct dependency. The
  switch MUST NOT restore npm-style flat hoisting project-wide to hide undeclared imports.
- **FR-007**: The Vercel configuration MUST install with pnpm from the frozen lockfile,
  including development dependencies needed by the build, and MUST keep the current build
  command, function entry, included files, and output directory behaviour unchanged.
- **FR-008**: The deployed function MUST start and serve requests with no missing-module
  errors. Verify this on a preview deployment before the change merges.
- **FR-009**: CI MUST install with the pinned pnpm version from the frozen lockfile, MUST
  cache the pnpm package store between runs, and MUST run all five constitution gates with
  pnpm: lint, unit tests with coverage, end-to-end tests, build, and dependency audit.
  The audit step MUST fail the pipeline on any high or critical advisory that has not been
  accepted, and MUST NOT fail on lower severities.
- **FR-010**: Package scripts that call npm internally MUST call pnpm instead, so that no
  script depends on npm being present.
- **FR-011**: The dependency audit gate MUST run with pnpm, locally and in CI. Each
  accepted advisory MUST be recorded in the repository, with its justification and review
  date, in a form the audit step reads, so an accepted advisory does not fail CI and an
  unaccepted one does. A high or critical advisory MAY be accepted only when no patched
  version exists anywhere in its dependency chain.
- **FR-017**: After the legacy dependencies are removed (FR-013), this feature MUST upgrade
  dependencies until the audit reports no high or critical advisories, apart from those
  accepted under FR-011. The remedies, in order of preference, are:
  1. Upgrade the direct dependency within its current major version.
  2. Force a patched version of the transitive package.
  3. Upgrade the direct dependency to a new major version.
  Each upgrade MUST be a separate, revertible step, and all gates MUST pass after it.
- **FR-018**: The upgrades MUST NOT change any endpoint's observable behaviour: its routes,
  status codes, request validation, and response shapes. The existing unit, e2e, and
  API-documentation tests are the evidence, and none of them may be weakened to make an
  upgrade pass.
- **FR-012**: The README, CLAUDE.md, script usage comments, and the constitution's quality
  gate list MUST reference pnpm commands. The constitution change MUST follow its amendment
  procedure as a PATCH bump.
- **FR-013**: The legacy deployment targets MUST be removed as dead configuration, which
  leaves Vercel as the only deploy path. This covers the AWS Lambda Docker image, the
  Serverless Framework config and its local state, the Lambda entry file and its TypeScript
  config, the Heroku Procfile, the static-site config, and the package scripts that exist
  only for those targets (`predeploy`, `heroku-postbuild`, `build-lambda`). Dependencies
  that only those removed files use MUST be removed too. Confirm each one has no remaining
  importer before removing it.
- **FR-015**: Removing the legacy files MUST NOT change where the compiled application
  lands, because the Vercel function entry loads it from a fixed path. The root-level
  database module is still imported by the application and MUST stay where it is.
- **FR-016**: The constitution's references to AWS Lambda as a deployment target MUST be
  updated to name Vercel as the only target. This goes in the same PATCH amendment as the
  gate list change (FR-012).
- **FR-014**: Instructions MUST tell a developer with an existing npm install how to move
  to pnpm (a clean reinstall), and following them MUST yield passing gates.

### Key Entities

- **Package manager declaration**: The single pinned statement of which package manager
  and which exact version the project uses. Local tooling, CI, and Vercel all read it.
- **Lockfile**: The recorded, reproducible dependency tree. The pnpm lockfile replaces the
  npm one, and only one exists at a time.
- **Install-script allowlist**: The named set of dependencies allowed to run code during
  install. Everything else is denied.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a fresh clone, a developer reaches a running local API with all five gates
  passing using only pnpm commands, following the README as written, on the first attempt.
- **SC-002**: A Vercel preview of the branch deploys successfully on the first push after
  the configuration change, and its health route reports the database as reachable.
- **SC-003**: Unit-test coverage after the switch equals coverage before it, both overall
  and for the auth module, and no test is skipped or removed to get there.
- **SC-004**: At the checkpoint lockfile (FR-003), no dependency's resolved version
  differs from the npm lockfile. After the upgrades, the pull request lists and justifies
  every changed version.
- **SC-008**: The dependency audit reports zero high and zero critical advisories that are
  not accepted, down from 27 (22 high, 5 critical) under npm on 2026-09-21. Each accepted
  advisory has a recorded justification stating that no patched version exists.
- **SC-005**: No tracked file outside intentional references (registry badges, ignore
  entries for npm debug logs) instructs anyone to run an npm or npx command.
- **SC-006**: A CI run with unchanged dependencies installs faster than the first run on
  the branch, which shows the package store cache is reused.
- **SC-007**: Cold-start time and function bundle size on Vercel stay within 10% of the
  last npm-built deployment.

## Assumptions

- Node stays on 24.x. Corepack ships with Node 24 and is the expected way to get the pinned
  pnpm version locally. A global pnpm install also works, provided it matches the pin.
- The pnpm version to pin is the current stable major at plan time. The exact number is a
  planning decision.
- The Vercel project settings do not override the install command. `vercel.json` is the
  source of truth, as it is today.
- Validation happens on a Vercel preview deployment. Production switches over when the
  pull request merges, with no separate cutover step.
- Upgrading dependencies to clear high and critical advisories is in scope (FR-017), and so
  is removing dependencies that only the deleted legacy targets used (FR-013). Upgrading
  for any other reason, such as new features or clearing moderate or low advisories, is
  out of scope.
- The advisory count comes from an npm audit on 2026-09-21: 27 high or critical, including
  direct dependencies `mongoose`, `@nestjs/platform-express`, and `@nestjs/cli`. Some are
  expected to disappear with the legacy Serverless and AWS dependencies. The plan
  re-measures the count after the removal and decides per advisory which remedy applies.
- If a required fix forces a major framework upgrade (for example NestJS 10 → 11), the
  stack line in CLAUDE.md is updated to match.
- Nobody deploys the Lambda, Serverless, or Heroku targets today, so removing them affects
  no running environment.
- CLAUDE.md references `db:setup` and `db:reset` scripts that the current package manifest
  does not define. This feature converts those references to pnpm syntax but does not
  create the scripts. The gap is recorded here for follow-up.
- The Spec Kit tooling under `.specify/` and `.claude/` is not a Node project and is not
  affected.

---

description: "Task list for switching the package manager from npm to pnpm"
---

# Tasks: Switch the Package Manager from npm to pnpm

**Input**: Design documents from `/specs/003-pnpm-migration/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/developer-interface.md](./contracts/developer-interface.md), [quickstart.md](./quickstart.md)

**Tests**: This feature adds no new application tests, because no application behaviour
changes. The existing unit, e2e and `test/docs/` suites are the regression evidence
(FR-018), and each phase ends with verification tasks taken from
[quickstart.md](./quickstart.md). **No test file may be modified** by any task below.

**Organization**: Tasks are grouped by user story. US4 (P2) runs **before** US3 (P2),
because US3's CI audit gate cannot pass until US4 has cleared the advisories. Both stories
have the same priority, so this reorders nothing in priority terms.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Every command runs from the repository root:
  `/Users/ivan.chavarro/Projects/personals/chalet/checklist-api`

## Ground Rules (apply to every task)

- Work only on branch `003-pnpm-migration`. Check `git branch --show-current` before every
  commit. **Never commit to `main`.**
- Commit messages: an imperative summary line with no `feat:` or `fix:` prefix, and a body
  that explains why. End with the attribution line from the session instructions.
- "Gates 1–4" means `pnpm lint:ci && pnpm test && pnpm test:e2e && pnpm build`.
  "Gate 5" means `pnpm audit --audit-level high`.
- Do not use `pnpm update`, `pnpm audit --fix`, `shamefully-hoist` or
  `node-linker=hoisted`. Research R3 and R9 explain why: they move unrelated packages,
  force `@nestjs/core` to 11, or hide undeclared imports.
- Keep scratch files (version dumps, audit JSON) in the session scratchpad, not the repo.

---

## Phase 1: Setup (Baselines)

**Purpose**: Record the npm-era numbers that the success criteria are measured against,
before anything changes.

- [X] T001 Confirm the working environment. `git branch --show-current` prints
  `003-pnpm-migration`, `git status --short` is empty, and `node -v` prints `v24.x`. Run
  `corepack enable pnpm && pnpm -v`; Corepack may download pnpm. Note: `pnpm -v` only shows
  12.5.1 after T004 adds `packageManager`.
- [X] T002 Record the npm baselines in `specs/003-pnpm-migration/baseline.md` (new file). It
  needs these sections:
  1. The HEAD commit hash, labelled "pre-switch commit".
  2. Unit coverage from `npx jest --coverage` on the current npm `node_modules`. Expected
     "All files" row: 71.78 / 41 / 38.34 / 69.55. Also record the `src/auth` rows.
  3. Counts from `npm audit --json`: expected 22 high and 5 critical, across 27 packages.
  4. A placeholder "Vercel baseline" section with fields for the function bundle size and
     cold-start duration of `api/index.js`.
- [ ] T003 Fill the "Vercel baseline" section of
  `specs/003-pnpm-migration/baseline.md`. Take the numbers from the current production
  deployment in the Vercel dashboard: Deployment → Functions → `api/index.js` for the size,
  and a cold-invocation duration from the logs. This is a **manual step for the
  maintainer**. If you can't reach the dashboard, leave the fields marked `TODO(maintainer)`
  and continue; T041 depends on them.

**Checkpoint**: The baselines are captured. SC-003, SC-004, SC-007 and SC-008 each have a
"before" value.

---

## Phase 2: Foundational (pnpm Checkpoint + Legacy Removal)

**Purpose**: Replace npm with pnpm **with no version changes**, then delete the dead deploy
targets. Every user story builds on this tree.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### 2A. Checkpoint lockfile (FR-001–FR-006, FR-010)

- [X] T004 In `package.json`:
  - add the top-level field `"packageManager": "pnpm@12.5.1"`;
  - extend `engines` to
    `{"node": "24.x", "pnpm": "12.x", "npm": "please-use-pnpm", "yarn": "please-use-pnpm"}`
    (see data-model §1);
  - delete the `prebuild` script. It calls an undeclared `rimraf`, and
    `nest-cli.json#compilerOptions.deleteOutDir` already clears `dist` (research R9).
- [X] T005 Generate the checkpoint lockfile. Run `pnpm import`, which reads
  `package-lock.json` and writes `pnpm-lock.yaml`. The file must start with
  `lockfileVersion: '9.0'`.
- [X] T006 [P] Create `pnpm-workspace.yaml` with only the build-script allowlist (research
  R5):
  ```yaml
  allowBuilds:
    bcrypt: true
    mongodb-memory-server: true
    '@nestjs/core': false
    '@scarf/scarf': false
    esbuild: false
  ```
  Add no `packages:` key. Add a one-line comment above each `false` entry saying why it is
  denied: funding banner, install telemetry, binary self-check.
- [X] T007 [P] Create `.npmrc` containing exactly `engine-strict=true` (research R8). It must
  contain no registry tokens.
- [X] T008 Declare the undeclared `dotenv` import used by `scripts/audit-user-roles.ts`. Run
  `pnpm add -D --save-exact dotenv@16.4.5`; that is the version npm had hoisted (research
  R9).
- [X] T009 Refresh the lockfile so it records the pnpm pin (`packageManagerDependencies`).
  Run `pnpm install`. Then check that a clean, non-interactive install succeeds:
  `rm -rf node_modules && CI=true pnpm install --frozen-lockfile </dev/null; echo $?` must
  print `0`. If it fails with `ERR_PNPM_IGNORED_BUILDS`, add the named package to
  `pnpm-workspace.yaml#allowBuilds` as `false`, unless it is a native addon the app needs at
  runtime.
- [X] T010 Verify there is no version drift (FR-003, SC-004, quickstart §2). Write a
  throwaway Node script in the scratchpad that:
  1. reads every `name@version` from `pnpm-lock.yaml`'s `packages:` section;
  2. reads every `node_modules/**` entry's `version` from
     `git show <pre-switch commit>:package-lock.json`;
  3. prints every package whose version set differs.

  Expected output: nothing, apart from `dotenv` now being a direct dependency at the same
  16.4.5. Spot-check that `typescript@5.6.3` and `prettier@3.2.5` are present. Record the
  result in `specs/003-pnpm-migration/baseline.md` under "Checkpoint drift check".
- [X] T011 Delete `package-lock.json`. In `.gitignore`, add `package-lock.json` and
  `yarn.lock` under a new `# Lockfiles from other package managers` comment. In
  `.prettierignore`, replace `package-lock.json` with `pnpm-lock.yaml`.
- [X] T012 Run gates 1–4. Expected: lint clean; unit tests 25 suites and 73 tests; e2e 5
  suites and 126 tests; build produces `dist/src/serverless.js`. Gate 5 is **expected to
  fail** at this point; record its counts in `baseline.md`. Then commit:
  - files: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.gitignore`,
    `.prettierignore`, `specs/003-pnpm-migration/baseline.md`, and the deletion of
    `package-lock.json`;
  - summary line, for example "Switch the package manager to pnpm with versions unchanged".
  - The body must say that this is the checkpoint FR-003 requires.

### 2B. Legacy deploy target removal (FR-013, FR-015)

- [X] T013 [P] Delete the legacy target files: `git rm docker/Dockerfile .dockerignore
  serverless.yml lambda.ts tsconfig.lambda.json Procfile static.json`. Also run
  `rm -rf .serverless docker`; `.serverless/` is untracked local state. **Do not delete**
  `database.module.ts`, because `src/app.module.ts` imports it, and do not delete
  `api/index.js`.
- [X] T014 [P] Remove the legacy-only scripts `predeploy`, `heroku-postbuild` and
  `build-lambda` from `package.json#scripts`. Afterwards, `grep -nE '"[^"]*": "[^"]*\bnpm\b'
  package.json` must return nothing (FR-010).
- [X] T015 Remove the dependencies that only the deleted files used. First confirm each has
  no importer:
  `grep -rnE "<pkg>" src test scripts api database.module.ts` must be empty for each.
  Then run:
  `pnpm remove @aws-sdk/client-lambda @codegenie/serverless-express @vendia/serverless-express aws-lambda serverless-http serverless-offline @types/aws-lambda`.
- [X] T016 In `.prettierignore`, remove the `.serverless/` line.
- [X] T017 Verify that the compiled entry path is unchanged (FR-015):
  1. Run `pnpm build`, then `ls dist/src/serverless.js dist/database.module.js`. Both must
     exist.
  2. Run `node -e "require('./api/index.js')"`. It must fail **only** with
     `Config validation error` because there is no env. A `Cannot find module` error is a
     failure.
  3. Run gates 1–4.
  4. Commit, for example "Remove the unused Lambda, Serverless and Heroku targets". The body
     should cite the clarification in spec.md and say that `database.module.ts` stays
     because the app imports it.

**Checkpoint**: pnpm is the only package manager, versions match npm, and Vercel is the only
deploy target. All user stories can now start.

---

## Phase 3: User Story 1 - A developer installs, runs, and verifies with pnpm (Priority: P1) 🎯 MVP

**Goal**: Anyone with a fresh clone gets a working, verified local setup using only pnpm,
and npm or yarn is refused.

**Independent Test**: Follow quickstart §1, §3 and §4 in a fresh clone. The npm guard
refuses, gates 1–4 pass, the API serves `/api/health`, and an unlisted install script fails
the install.

### Implementation for User Story 1

- [ ] T018 [P] [US1] Rewrite the "Installation", "Running the app" and "Test" sections of
  `README.md`:
  - Add a "Prerequisites" section: Node 24.x, then `corepack enable pnpm`.
  - Install becomes `pnpm install`.
  - Run becomes `pnpm start`, `pnpm start:dev`, `pnpm start:prod`.
  - Test becomes `pnpm test`, `pnpm test:e2e`, `pnpm test:cov`.
  - Add a line for the audit gate: `pnpm audit --audit-level high`.

  Keep the NestJS badge links; they are registry URLs, not commands.
- [ ] T019 [US1] Add a "Moving an existing clone from npm" section to `README.md`, after
  "Installation" (FR-014). It contains the three commands from
  contracts/developer-interface.md §3 and one sentence: `npm install` now fails on purpose.
  Also add a short "Adding dependencies" note: `pnpm add <pkg>`. If pnpm reports ignored
  build scripts, the new package must get an explicit `true` or `false` entry in
  `pnpm-workspace.yaml#allowBuilds`, and CI fails until it has one.
- [ ] T020 [P] [US1] In `scripts/audit-user-roles.ts`, change the usage comment on line 11
  from `NODE_ENV=local npx ts-node scripts/audit-user-roles.ts` to
  `NODE_ENV=local pnpm exec ts-node scripts/audit-user-roles.ts`. Change nothing else in the
  file.
- [ ] T021 [US1] Verify the npm guard (quickstart §1, spec Story 1 scenario 5). In a
  scratchpad copy of the repo with no `node_modules`, run `npm install`. It must exit
  non-zero with `notsup … "npm":"please-use-pnpm"`, and it must leave neither
  `package-lock.json` nor `node_modules` behind. Repeat with `npx --yes yarn install` if yarn
  is reachable; otherwise note it as skipped.
- [ ] T022 [US1] Validate a fresh clone (quickstart §3, SC-001):
  1. `git clone` the branch into the scratchpad and follow **only** the README as rewritten
     in T018 and T019.
  2. Run gates 1–4 there. Unit coverage must equal the T002 baseline (SC-003). Gate 5 is
     run and re-checked separately at T044, once US4's tree is in place — SC-001's "all
     five gates" claim is only fully true at that point, not here.
  3. Start the API with `pnpm start:dev`, using a copied `.env.local` that points at a
     reachable MongoDB. `curl -s localhost:3000/api/health` must return 200 with the
     database reachable. If there is no local MongoDB, record this sub-step as blocked,
     with the reason.
- [ ] T023 [US1] Verify the allowlist is enforced (quickstart §4, FR-005):
  1. Remove the `esbuild` line from `pnpm-workspace.yaml`.
  2. Run `rm -rf node_modules && CI=true pnpm install --frozen-lockfile </dev/null`. It must
     exit 1 with `ERR_PNPM_IGNORED_BUILDS`.
  3. Restore the line with `git checkout pnpm-workspace.yaml` and reinstall.
- [ ] T024 [US1] Commit the README and script-comment changes, for example "Document the
  pnpm workflow and the move from an npm clone".

**Checkpoint**: US1's gates 1–4 are complete and local development runs entirely on pnpm.
Gate 5 (the dependency audit, spec Story 1 acceptance scenario 3) still fails at this
point — it stays dirty until Phase 5 (US4) clears the advisories — and T044 re-runs all
five gates together at the end to confirm Story 1 is fully satisfied on the final tree.

---

## Phase 4: User Story 2 - Vercel installs with pnpm and the deployed API behaves the same (Priority: P1)

**Goal**: A Vercel preview deploy installs with the pinned pnpm, builds, and serves the API
exactly as before.

**Independent Test**: quickstart §5 on a preview URL. The build log shows `pnpm v12.5.1`
and `bcrypt … install: Done`; `/api/health` returns 200 with the database reachable; a
protected route refuses a caller with no credential; there is no `Cannot find module` on a
cold start.

### Implementation for User Story 2

- [ ] T025 [US2] In `vercel.json`, change **only** `installCommand`, to
  `"corepack enable pnpm && pnpm install --frozen-lockfile --prod=false"` (research R4).
  Leave `buildCommand` (`nest build`), `outputDirectory` (`public`), `functions` and
  `rewrites` byte-for-byte unchanged. Commit, for example "Install with the pinned pnpm on
  Vercel". The body must explain why Corepack is used: without it Vercel picks pnpm from the
  lockfile format, and that version ignores `allowBuilds`, so `bcrypt` would not be built.
- [ ] T026 [US2] Push the branch with `git push -u origin 003-pnpm-migration`. Pushing
  publishes the branch, so confirm with the maintainer first if that has not already been
  agreed. Open the Vercel preview build log and check the first three items of quickstart
  §5:
  - the install shows `pnpm v12.5.1`;
  - `bcrypt … install: Done` is present;
  - `nest build` completes.

  Record the outcome in `specs/003-pnpm-migration/baseline.md` under "Preview (checkpoint
  tree)".
- [ ] T027 [US2] If T026's install step fails at `corepack enable`, apply the research R4
  fallback:
  1. Ask the maintainer to set the Vercel project env var `ENABLE_EXPERIMENTAL_COREPACK=1`
     for Preview and Production.
  2. Change `vercel.json#installCommand` to
     `pnpm install --frozen-lockfile --prod=false`.
  3. Commit with a body recording the fallback and why.
  4. Redeploy.

  Skip this task if T026 passed.
- [ ] T028 [US2] Run the preview runtime checks (quickstart §5, SC-002, FR-008):
  1. `curl` `https://<preview>/api/health`. Expect 200, with the database reported as
     reachable in the body.
  2. `curl` one protected route with no `Authorization` header, for example
     `GET /api/users`. Expect the same status production returns today, checked with the
     same `curl` against production.
  3. In the Vercel function logs for the first request, confirm there is no
     `Cannot find module`.

  Record everything in `baseline.md`.

**Checkpoint**: US2 is complete on the checkpoint tree. T041 re-validates it on the final,
upgraded tree.

---

## Phase 5: User Story 4 - No known high or critical vulnerabilities (Priority: P2)

**Goal**: `pnpm audit --audit-level high` exits 0 with `auditConfig.ignoreGhsas` empty, and
the API contract is unchanged.

**Independent Test**: Gate 5 exits 0. Gates 1–4 pass, and no test or spec file has changed
since the checkpoint commit (quickstart §8).

**Why before US3**: US3's CI runs gate 5, which fails until this phase is done.

### Implementation for User Story 4

- [ ] T029 [US4] Re-measure the audit after the legacy removal. Run
  `pnpm audit --json > <scratchpad>/audit-post-legacy.json` and count the unique high and
  critical advisories and packages. Expected: 49 advisories across 17 packages (research
  R3). Record the count in `baseline.md`. If the set differs from research R3's list,
  newer advisories have been published since the plan; add each new one to the remedy
  order in FR-017 before continuing.
- [ ] T030 [US4] Remedy 1, same-major runtime and test bumps:
  1. `pnpm add mongoose@^8.24.4 @nestjs/common@^10.4.22 @nestjs/core@^10.4.22 @nestjs/platform-express@^10.4.22 class-validator@^0.14.4`
  2. `pnpm add -D @nestjs/testing@^10.4.22 supertest@^7.2.2`
  3. Run gates 1–4.
  4. Commit, for example "Upgrade mongoose, NestJS 10.4 and test deps to clear advisories".
     The body lists each from → to version and the advisory package it clears (research
     R3 table).
- [ ] T031 [US4] Remedy 3, `bcrypt` major (it drops the `tar` advisory chain):
  1. `pnpm add bcrypt@^6.0.0`
  2. Confirm `bcrypt … install: Done` in the install output.
  3. Run gates 1–4. The auth unit and e2e suites exercise `hash` and `compare`, and the
     `src/auth` coverage thresholds must still hold.
  4. Commit. The body notes that bcrypt 6 replaces node-pre-gyp with node-gyp-build and
     keeps the same `hash` and `compare` API.
- [ ] T032 [US4] Remedy 3, build-tool major:
  1. `pnpm add -D @nestjs/cli@^11.0.24 @nestjs/schematics@^11.1.0`
  2. Confirm `pnpm why typescript` shows 5.9.3. This is expected, because the CLI pins it
     (research R3).
  3. Run gates 1–4. `nest build` must still apply the `@nestjs/swagger/plugin` from
     `nest-cli.json`: the `test/docs/` e2e checks pass.
  4. Commit. The body records the TypeScript 5.6.3 → 5.9.3 side effect.
- [ ] T033 [US4] Remedy 2, same-major overrides. Add this `overrides:` block to
  `pnpm-workspace.yaml`, with a comment above it saying each entry is scoped to the
  vulnerable major and clears a high or critical advisory:
  ```yaml
  overrides:
    brace-expansion@1: ^1.1.18
    browserslist@4: ^4.28.7
    flatted@3: ^3.4.2
    js-yaml@3: ^3.15.2
    js-yaml@4: ^4.3.2
    jws@3: ^3.2.3
    lodash@4: ^4.18.1
    minimatch@3: ^3.1.4
    multer@2: ^2.3.0
    path-to-regexp@0.1: ^0.1.13
    picomatch@2: ^2.3.2
  ```
  Also add an empty `auditConfig:` block with `ignoreGhsas: []`. Above it, add a comment
  giving the entry format:
  `# - GHSA-xxxx-xxxx-xxxx  # <package>: no patched version exists; review YYYY-MM-DD`
  (research R7, FR-011). Then run `pnpm install`.
- [ ] T034 [US4] Verify US4 is complete:
  1. Gate 5, `pnpm audit --audit-level high`, exits 0 and reports 0 high and 0 critical.
     Record the moderate and low counts in `baseline.md` (SC-008).
  2. Run gates 1–4.
  3. `git diff --stat <checkpoint commit>..HEAD -- test 'src/**/*.spec.ts'` prints nothing
     (FR-018).
  4. Compare the direct dependency ranges in `package.json` with the checkpoint commit.
     The only changes must be the ones in research R3, T008 and T015. In particular,
     `@nestjs/mapped-types` must still be `"*"`, `prettier` `^3.2.5` and `typescript`
     `^5.4.5`.
  5. Commit the overrides and audit config, for example "Force patched transitive versions
     for the remaining advisories".

**Checkpoint**: The dependency tree is clean at high and critical, with the API unchanged.

---

## Phase 6: User Story 3 - CI and documentation use pnpm (Priority: P2)

**Goal**: CI enforces all five gates with pnpm and a cached store, and every instruction a
contributor reads says pnpm.

**Independent Test**: A PR run installs with `--frozen-lockfile`, runs all five gates green,
and a re-run hits the cache (quickstart §6). The SC-005 grep finds no npm commands
(quickstart §7).

### Implementation for User Story 3

- [ ] T035 [US3] Rewrite `.github/workflows/ci.yml`, following data-model §6 and keeping the
  existing `name`, `on` and `concurrency` blocks and the constitution-gate comments:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` with `node-version-file: package.json` and **no** `cache` key
  3. A step named "Enable pnpm" running `corepack enable pnpm`
  4. A step `id: pnpm-store` running `echo "path=$(pnpm store path --silent)" >> "$GITHUB_OUTPUT"`
  5. `actions/cache@v4` with `path: ${{ steps.pnpm-store.outputs.path }}`,
     `key: ${{ runner.os }}-pnpm-${{ hashFiles('pnpm-lock.yaml') }}` and
     `restore-keys: ${{ runner.os }}-pnpm-`
  6. `pnpm install --frozen-lockfile`
  7. Gates: `pnpm lint:ci`, `pnpm test -- --coverage`, `pnpm test:e2e`, `pnpm build`, then a
     new step "Dependency audit" (`# Constitution gate 5`) running
     `pnpm audit --audit-level high`

  Update the job `name` to "Lint, test, e2e, build, audit".
- [ ] T036 [P] [US3] Update `CLAUDE.md`:
  - **Stack & decisions:** TypeScript 5.6 → 5.9; add "pnpm 12 via Corepack
    (`packageManager` pinned)"; the Deploy bullet says Vercel is the only target.
  - **Run & test locally:** every `npm run X` becomes `pnpm X`, and `npm test` becomes
    `pnpm test`. `npm run db:setup` and `npm run db:reset` become `pnpm db:setup` and
    `pnpm db:reset`; leave the scripts undefined, per the spec's assumption.
  - **Conventions:** the five gates are lint, test, e2e, build and audit, all enforced in CI.
  - Add one line: install scripts run only for packages allowed in
    `pnpm-workspace.yaml#allowBuilds`.
- [ ] T037 [P] [US3] Amend `.specify/memory/constitution.md` as a PATCH, 1.0.0 → 1.0.1
  (FR-012, FR-016):
  - line 32: "(AWS Lambda, Vercel)" → "(Vercel)";
  - line 96: "`npm audit`" → "`pnpm audit --audit-level high`";
  - line 136: "on Lambda and Vercel" → "on Vercel serverless functions";
  - line 157: "(Docker image, Lambda bundle, Vercel build)" → "(the Vercel build and
    function bundle)";
  - lines 165–169: the gates become `pnpm lint:ci`, `pnpm test`, `pnpm test:e2e`,
    `pnpm build` and `pnpm audit --audit-level high`;
  - prepend a new Sync Impact Report entry: 1.0.0 → 1.0.1, PATCH, the reason (the package
    manager and deploy target changed, and no requirement changed), no principles
    added or removed;
  - update the footer: `**Last Amended**: 2026-09-21`, version 1.0.1.
- [ ] T038 [US3] Verify there are no npm instructions left (SC-005, quickstart §7). Run
  `git grep -nE '\bnpm (i|install|ci|run|test|audit)\b|\bnpx\b' -- . ':!specs/001-*' ':!specs/002-*'`.
  Every remaining match must be inside `specs/003-pnpm-migration/`. Fix any other match
  before continuing.
- [ ] T039 [US3] Commit the CI, CLAUDE.md and constitution changes as **two** commits:
  1. CI, for example "Run all five gates with pnpm in CI". The body cites the constitution's
     "enforced by CI, not by memory" rule.
  2. CLAUDE.md and the constitution, for example "Point project guidance and the
     constitution at pnpm and Vercel". The body says this is a PATCH amendment that needs
     owner approval.
- [ ] T040 [US3] Open the pull request against `main` with `gh pr create --base main`. This
  is outward-facing, so confirm with the maintainer before running it; a draft PR is
  acceptable. Then verify quickstart §6: the install uses `--frozen-lockfile`, all five
  gate steps are green, and re-running the workflow shows a cache hit and a faster install
  (SC-006). Record the two install durations in `baseline.md`.

**Checkpoint**: All four stories are complete, and CI certifies the same tree that
developers and Vercel install.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Re-validate on the final tree and prepare the PR for review.

- [ ] T041 Re-run the Vercel preview checks from T026 and T028 on the **final** tree (the
  PR head). Compare the function bundle size and cold start with the T003 baseline; each
  must be within 10% (SC-007). Record the results in `baseline.md`. If a baseline is still
  `TODO(maintainer)`, say so in the PR instead of claiming SC-007.
- [ ] T042 Write the PR description. It must include:
  1. A summary.
  2. The constitution principles touched: III (improved), plus the gates and governance
     (PATCH amendment 1.0.1, needs owner approval).
  3. Every direct dependency version change, from → to, and the reason, from research R3,
     R9 and R10 (FR-003, SC-004).
  4. The side effect TypeScript 5.6.3 → 5.9.3.
  5. The 11 overrides, and that each stays within one major.
  6. Audit counts before and after (SC-008).
  7. The Vercel preview results.
  8. A **Deviations** section: overall unit coverage is 71.78%, below the 80% floor; it
     already exists on `main` and this PR leaves it unchanged. File a tracked issue for
     the coverage gap (the constitution's Governance section requires pre-existing
     violations to be "recorded as issues," not just noted in a PR) and link it here.
  9. A **Follow-ups** section:
     - the `db:setup` and `db:reset` scripts that CLAUDE.md references are not defined;
     - `specs/README.md`, which CLAUDE.md names as the product state, does not exist yet;
     - the remaining moderate and low advisories.

  End the description with the PR attribution line from the session instructions.
- [ ] T043 [P] Mark every requirement FR-001 to FR-018 and every success criterion SC-001 to
  SC-008 as met, blocked or not applicable in `specs/003-pnpm-migration/baseline.md`, each
  with the task that shows it. Commit this with any outstanding `baseline.md` updates.
- [ ] T044 Run the whole of [quickstart.md](./quickstart.md) one last time from a fresh clone
  of the PR head, and confirm that every checkbox in it holds.

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Phase 1 Setup ──▶ Phase 2 Foundational (2A checkpoint ──▶ 2B legacy removal)
                        │
                        ├──▶ Phase 3 US1 (local)        ─┐
                        ├──▶ Phase 4 US2 (Vercel)        ├──▶ Phase 7 Polish
                        └──▶ Phase 5 US4 (advisories) ──▶ Phase 6 US3 (CI + docs) ─┘
```

- **Setup**: nothing before it. T003 is manual and may lag behind; only T041 needs it.
- **Foundational**: 2A must finish, with T012 committed, before 2B. 2B blocks every story.
- **US1**, **US2** and **US4** can each start as soon as Phase 2 is done.
- **US3** depends on **US4**, because gate 5 must pass in CI. It also depends on T025,
  because the constitution and CLAUDE.md edits describe the Vercel install.
- **Polish** depends on all four stories.

### Within Each Phase

- T005 (import) before T008 (add dotenv) before T009 (refresh lockfile) before T010 (drift
  check).
- T030 → T031 → T032 → T033, one commit each, so any regression bisects to one remedy.
- T035–T037 before T038 (the grep) before T039 (commit) before T040 (PR).

### Parallel Opportunities

- **Phase 2A**: T006 (`pnpm-workspace.yaml`) and T007 (`.npmrc`) are separate new files.
- **Phase 2B**: T013 (file deletions) and T014 (`package.json` scripts) touch different
  files. T015 must follow T014, because both edit `package.json`.
- **US1**: T018 and T020 are different files. T019 edits `README.md` after T018.
- **Across stories**: once Phase 2 is done, US1 (README and scripts), US2 (`vercel.json` and
  the preview) and US4 (`package.json`, lockfile, workspace yaml) touch separate files.
  **Exception**: US1's T023 temporarily edits `pnpm-workspace.yaml`, so don't run it while
  T033 is in progress.
- **US3**: T036 (`CLAUDE.md`) and T037 (the constitution) are independent.

---

## Parallel Example: after Phase 2

```bash
# Three independent streams:
Task: "T018 [US1] Rewrite README install/run/test sections for pnpm"
Task: "T025 [US2] Change vercel.json installCommand to Corepack + pnpm"
Task: "T029 [US4] Re-measure the audit after legacy removal"

# Within US3:
Task: "T036 [US3] Update CLAUDE.md for pnpm, TS 5.9, Vercel-only"
Task: "T037 [US3] PATCH-amend the constitution to 1.0.1"
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 → Phase 2 → Phase 3.
2. **Stop and validate**: quickstart §1, §3 and §4. Local development runs entirely on
   pnpm, and the switch is already safe to review on its own.
3. This MVP does not ship to production yet. Merging needs US2 (the Vercel install would
   otherwise still say npm, and `package-lock.json` is gone), and US3 and US4 for a green CI.

### Incremental Delivery

1. Checkpoint (T012) → legacy removal (T017): each is a reviewable commit on its own.
2. US1 and US2: the developer and deploy paths are proven on the checkpoint tree.
3. US4: the upgrades, one remedy per commit.
4. US3: CI enforces everything, and the docs say pnpm.
5. Polish: final preview, PR.

**One PR** carries all of it, because `main` needs every piece at once: the lockfile, the
Vercel install and CI. The commit sequence inside the PR is the incremental record.

---

## Notes

- 44 tasks. Commit at each point a task says "Commit"; never batch commits across phases.
- If a gate fails after an upgrade task, revert **that task's commit** and investigate.
  Don't weaken a test, and don't widen an override across a major.
- If advisories appear that research R3 did not list (T029), apply FR-017's remedy order.
  Accept one (`auditConfig.ignoreGhsas`) only if no patched version exists anywhere in its
  chain, and record the justification and review date.

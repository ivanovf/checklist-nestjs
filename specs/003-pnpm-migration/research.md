# Research: Switch the Package Manager from npm to pnpm

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-09-21

Every finding below comes from something I ran on 2026-09-21, not from documentation
alone. I tested against a scratch copy of the repository with pnpm 12.5.1 (via Corepack)
on Node 24.21.0. Where something could not be run locally (the Vercel build), I say so and
name the check that will verify it.

---

## R1. Which pnpm version to pin

**Decision**: pnpm **12.5.1**, pinned exactly in `package.json#packageManager` and
supplied everywhere by Corepack.

**Rationale**:
- 12.5.1 is the current `latest` dist-tag. The spec assumes "current stable major at plan
  time".
- Corepack ships with Node 24 and reads `packageManager`. That gives local machines, CI and
  Vercel one mechanism and one source of truth (FR-001).
- pnpm 12 records the pin in the lockfile (`packageManagerDependencies`). A pnpm version
  mismatch therefore fails `--frozen-lockfile` instead of passing silently. Observed:
  `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE` after `packageManager` was added and
  before the lockfile was regenerated.

**Consequence found**: pnpm 12 reads project settings (`overrides`, `allowBuilds`,
`auditConfig`) from **`pnpm-workspace.yaml`**, not from a `pnpm` key in `package.json`.
Overrides placed in `package.json#pnpm` were silently ignored in testing. The repository
gains a `pnpm-workspace.yaml` even though it is a single package.

**Alternatives considered**:
- *pnpm 10*: the version Vercel's builder is known to run natively. Rejected. Its settings
  keys differ (`onlyBuiltDependencies` rather than `allowBuilds`), so choosing it means
  choosing an older line to fit one platform, when R4 solves the platform side anyway.
- *Global `npm i -g pnpm`*: no pin enforcement, and it relies on npm. Rejected.
- *`pnpm/action-setup` in CI*: a second installation mechanism alongside Corepack.
  Rejected in favour of one mechanism (R6).

---

## R2. Lockfile conversion with no version drift (FR-003, SC-004)

**Decision**: Generate the first lockfile with `pnpm import` from the existing
`package-lock.json`, commit it as the checkpoint, and then delete `package-lock.json`.

**Evidence**: The imported lockfile (lockfileVersion `9.0`) resolves `typescript@5.6.3` and
`prettier@3.2.5`, the same versions as `package-lock.json`. Checked by spot comparison; the
task will diff every package (see [quickstart.md](./quickstart.md) §2).

**Alternatives considered**: A plain `pnpm install` without import re-resolves every range
to its newest match. Rejected, because that is the drift the spec forbids at the
checkpoint.

---

## R3. Clearing high and critical advisories (FR-017, SC-008)

**Baseline**: `npm audit` found 27 packages with high or critical advisories (22 high,
5 critical). `pnpm audit` counts per advisory, and on the checkpoint lockfile it reports
71 advisories across 23 packages.

**Step 1: remove legacy dependencies (FR-013).** Removing `@aws-sdk/client-lambda`,
`@codegenie/serverless-express`, `@vendia/serverless-express`, `aws-lambda`,
`serverless-http`, `serverless-offline` and `@types/aws-lambda` brings this down to
**49 advisories across 17 packages**. Nothing in `src/`, `test/`, `scripts/` or `api/`
imports any of them; only `lambda.ts` imported `aws-lambda` and `serverless-http`.

**Step 2: targeted direct upgrades (remedy 1: same major; remedy 3: new major only where
needed).**

| Direct dependency | From → to | Why |
|---|---|---|
| `mongoose` | ^8.4.0 → ^8.24.4 | Critical and high advisories in mongoose itself (search injection); same major |
| `@nestjs/common`, `core`, `platform-express`, `testing` | ^10.3.8 / ^10.4.15 → ^10.4.22 | Brings `express` 4.22 (body-parser, qs) and `multer` 2.x instead of 1.4.4-lts; same major |
| `class-validator` | ^0.14.1 → ^0.14.4 | `validator` advisory; same minor line |
| `supertest` | ^7.0.0 → ^7.2.2 | `form-data` critical advisory; same major |
| `bcrypt` | ^5.1.1 → **^6.0.0** | `tar` has 9 high/critical advisories via `@mapbox/node-pre-gyp`. bcrypt 6 drops node-pre-gyp for `node-gyp-build`. Same `hash`/`compare` API |
| `@nestjs/cli` | ^10.3.2 → **^11.0.24** | `glob`, `tmp`, `picomatch`, `serialize-javascript` advisories via Angular DevKit 17; build-time tool only |
| `@nestjs/schematics` | ^10.1.1 → **^11.1.0** | Must match `@nestjs/cli` 11 |

Both major upgrades are build or install tooling. The application framework stays on
NestJS 10, so there is **no runtime framework major upgrade**.

**Step 3: same-major overrides for what remains transitive (remedy 2).** These live in
`pnpm-workspace.yaml#overrides`, and each is scoped to the vulnerable major so it can never
move a package across a major:

```text
brace-expansion@1 → ^1.1.18    js-yaml@3 → ^3.15.2    lodash@4 → ^4.18.1
browserslist@4    → ^4.28.7    js-yaml@4 → ^4.3.2     minimatch@3 → ^3.1.4
flatted@3         → ^3.4.2     jws@3     → ^3.2.3     multer@2 → ^2.3.0
path-to-regexp@0.1 → ^0.1.13   picomatch@2 → ^2.3.2
```

`multer` needs an override because `@nestjs/platform-express@10.4.22` pins exactly `2.0.2`.

**Result**: **0 high, 0 critical**. 8 moderate and 1 low remain, which is out of scope per
the spec. No advisory needs to be accepted.

**All five gates on that exact tree**: lint ✓, build ✓ (`dist/src/serverless.js` present),
unit 25/25 suites, 73/73 tests ✓, e2e 5/5 suites, 126/126 tests ✓,
`pnpm audit --audit-level high` exit 0 ✓. Unit coverage is **identical** to the npm
baseline measured the same day: 71.78 % statements, 41 % branches, 38.34 % functions,
69.55 % lines (SC-003).

**Side effect to list in the PR**: `typescript` resolves to **5.9.3** (was 5.6.3).
`@nestjs/cli@11.0.24` depends on exactly `typescript@5.9.3`, and pnpm dedupes the
project's `^5.4.5` onto it. The range is unchanged and all gates pass. CLAUDE.md's
"TypeScript 5.6" becomes "5.9".

**Alternatives considered and rejected**:
- *`pnpm update` (in-range refresh of everything)*: clears most advisories but moves every
  package. For example, `@nestjs/mapped-types` is declared `"*"` and jumped 2.0.5 → 12.0.0,
  and prettier 3.2.5 → 3.9.8 broke `lint:ci` on one file. That is upgrading for reasons
  other than advisories, which is out of scope.
- *`pnpm audit --fix update`*: behaved like the above and rewrote every direct range.
- *`pnpm audit --fix override`*: generated about 45 overrides, patched moderate and low
  advisories as well, and **forced `@nestjs/core` to ^11.1.18**, a silent runtime major
  upgrade. Rejected. The override list is hand-written and scoped per major.
- *NestJS 10 → 11 runtime upgrade*: not needed once `multer` is overridden. It would add
  breaking-change risk (Express 5 routing) with no advisory to justify it.

---

## R4. Vercel install with pnpm 12 (FR-007, FR-008)

**Decision**: In `vercel.json`:

```text
"installCommand": "corepack enable pnpm && pnpm install --frozen-lockfile --prod=false"
```

`buildCommand` (`nest build`), `outputDirectory` (`public`), `functions` and `rewrites`
stay unchanged.

**Rationale**:
- Vercel otherwise picks a pnpm version from the lockfile format (`9.0` → pnpm 9 or 10).
  An older pnpm does not read pnpm 12's `allowBuilds`, so **`bcrypt` would not be built**,
  and the function would fail at runtime. Running Corepack explicitly makes the pinned
  12.5.1 the one that installs.
- `--prod=false` is the pnpm equivalent of today's `--include=dev`. It was verified with
  `NODE_ENV=production`: dev dependencies, including the `nest` binary the build needs, are
  installed.
- `--frozen-lockfile` fails the deploy if the lockfile and `package.json` disagree.

**Evidence from local runs**:
- The compiled output stays at `dist/src/serverless.js`, because `database.module.ts`
  still sits at the root and `src/app.module.ts` imports it (FR-015).
- `require('./api/index.js')` loads the whole application through pnpm's linked
  `node_modules` and stops only at env validation, which is the expected fail-fast
  behaviour with no `.env`. That means no missing module.
- Replacing an npm-era `node_modules` (a stale Vercel build cache) with `CI=true` and no
  terminal succeeded without a purge prompt.

**Not verifiable locally**: the Vercel build image itself, and function-bundle tracing of
pnpm's symlinked store. Both are covered by the preview-deploy checks in
[quickstart.md](./quickstart.md) §5.

**Fallback if `corepack enable` is refused in the build image**: set the Vercel project
environment variable `ENABLE_EXPERIMENTAL_COREPACK=1`, which makes Vercel honour
`packageManager`, and set `installCommand` to `pnpm install --frozen-lockfile
--prod=false`. That setting lives in the dashboard, which departs from the spec's
"`vercel.json` is the source of truth" assumption, so it is the fallback, not the primary
approach.

---

## R5. Build-script allowlist (FR-005)

**Decision**: `pnpm-workspace.yaml#allowBuilds`:

| Package | Allowed | Why |
|---|---|---|
| `bcrypt` | **true** | Native addon; bcrypt 6 builds or selects a prebuild through `node-gyp-build` |
| `mongodb-memory-server` | **true** | Postinstall pre-downloads the `mongod` binary the e2e suite uses |
| `@nestjs/core` | false | Postinstall only prints a funding banner |
| `@scarf/scarf` | false | Install telemetry |
| `esbuild` | false | Comes in via webpack under `@nestjs/cli`. Its postinstall only validates the platform binary, which comes from an optional dependency |

**Evidence**: With `CI=true`, pnpm 12 **fails the install** (exit 1,
`ERR_PNPM_IGNORED_BUILDS`) when any dependency with a build script is not listed. Every
entry must be decided explicitly, and a new dependency that wants to run code at install
time breaks CI until someone reviews it. That enforces FR-005 at no extra cost. After a
frozen install with this list, `require('bcrypt').hash()` works.

---

## R6. CI with pnpm (FR-009)

**Decision**: In `.github/workflows/ci.yml`:
1. `actions/setup-node@v4` with `node-version-file: package.json` and no `cache` key yet,
   because pnpm is not on the PATH at that point.
2. `corepack enable pnpm`.
3. `actions/cache@v4` on the output of `pnpm store path`, keyed on the OS and
   `hashFiles('pnpm-lock.yaml')`, with an OS-only restore key.
4. `pnpm install --frozen-lockfile`.
5. Gates: `pnpm run lint:ci`, `pnpm test -- --coverage`, `pnpm run test:e2e`,
   `pnpm run build`, **`pnpm audit --audit-level high`**.

**Evidence**: `pnpm audit --audit-level high` exits **1** when high advisories are present
and **0** when only moderate or low remain (both observed).

**Alternatives considered**: `setup-node`'s `cache: pnpm` needs pnpm installed before
`setup-node` runs, which would mean two setup-node steps or `pnpm/action-setup`. Rejected in
favour of one explicit cache step.

---

## R7. Recording accepted advisories (FR-011)

**Decision**: `pnpm-workspace.yaml#auditConfig.ignoreGhsas`, with a YAML comment on each
entry giving the justification, "no patched version exists", and a review date.

**Evidence**: With 10 high GHSA ids listed, `pnpm audit --audit-level high` reported
"10 ignored" and exited 0. Without them it exited 1. The list starts **empty** (R3), and
the mechanism is documented for future use.

---

## R8. Refusing npm and yarn (FR-004)

**Decision**: Add `engines.npm: "please-use-pnpm"`, `engines.yarn: "please-use-pnpm"`, and
`engines.pnpm: "12.x"` to `package.json`, and add a committed `.npmrc` containing
`engine-strict=true`.

**Evidence**: `npm install` fails immediately with `notsup … Required: {"npm":"please-use-pnpm"…}`,
and **neither `package-lock.json` nor `node_modules` is created** (spec Story 1,
scenario 5). pnpm installs normally.

**Alternative rejected**: a `preinstall` script that checks `npm_config_user_agent`. It did
stop npm, but **npm had already written `package-lock.json`** before the root `preinstall`
ran, which fails scenario 5. `npx only-allow pnpm` has the same timing and also adds a
network fetch.

---

## R9. Undeclared dependencies exposed by pnpm (FR-006)

| Import | Where | Resolution |
|---|---|---|
| `dotenv` | `scripts/audit-user-roles.ts` | Worked under npm only through hoisting (16.4.5). **Declare** it as a devDependency at `16.4.5` |
| `express` | `src/serverless.ts`, `src/auth/**` | Type-only imports (`Request`, `Response`), resolved by the declared `@types/express`. No change |
| `rimraf` binary | `prebuild` script | Undeclared, and `sh: rimraf: command not found` under pnpm. `nest-cli.json` already sets `deleteOutDir: true`, so the whole `prebuild` script is redundant. **Remove it**; do not add rimraf |

With these, `lint:ci`, `build`, `test` and `test:e2e` all pass without turning hoisting
back on (`shamefully-hoist` / `node-linker=hoisted` are not used).

---

## R10. Legacy target removal (FR-013, FR-015)

**Remove**: `docker/Dockerfile` (and the then-empty `docker/`), `.dockerignore`,
`serverless.yml`, the local `.serverless/` directory (untracked), `lambda.ts`,
`tsconfig.lambda.json`, `Procfile`, `static.json`, and the package scripts `predeploy`,
`heroku-postbuild`, `build-lambda` and `prebuild` (R9).

**Keep**: `database.module.ts`, which `src/app.module.ts` imports, and `api/index.js`.

**Evidence**: The build after removal emits `dist/database.module.js` and
`dist/src/serverless.js`. The path `api/index.js` requires is unchanged.

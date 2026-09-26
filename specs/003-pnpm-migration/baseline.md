# Baseline: Switch the Package Manager from npm to pnpm

**Feature**: [spec.md](./spec.md) | **Tasks**: [tasks.md](./tasks.md)

Before and after numbers for SC-003, SC-004, SC-007 and SC-008.

## Pre-switch commit

`09096ae2513a51389cd6e4da4834cf2ee340ca64`

## Unit coverage on npm (SC-003)

Measured with `npx jest --coverage` on a `node_modules` from `npm ci` on the pre-switch
lockfile. Windows 11, Node 24.21.0, npm 12.1.0.

npm 12 blocks install scripts by default, so `npm ci` skipped bcrypt's native build. The
binding was fetched by hand with bcrypt's own `node-pre-gyp install` step before measuring.
The lockfile was not touched.

| Scope | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| All files | 71.78 | 41 | 38.34 | 69.55 |
| src/auth/controllers | 100 | 100 | 100 | 100 |
| src/auth/decorators | 100 | 100 | 100 | 100 |
| src/auth/guards | 100 | 86.84 | 100 | 100 |
| src/auth/models | 100 | 100 | 100 | 100 |
| src/auth/services | 100 | 100 | 100 | 100 |
| src/auth/strategy | 100 | 100 | 100 | 100 |

Suites: 25 passed of 25. Tests: 73 passed of 73.

## npm audit (SC-008)

From `npm audit --json`, counted per package:

| Severity | Packages |
|---|---|
| critical | 5 |
| high | 22 |
| moderate | 35 |
| low | 9 |

High and critical: 27 packages.

## Checkpoint drift check (FR-003, SC-004)

A scratch script compared every `name@version` in the `packages:` section of
`pnpm-lock.yaml` (from `pnpm import`, plus `dotenv`) with every `node_modules/**` entry in
`git show 09096ae:package-lock.json`.

- Distinct packages: 890 in both.
- Spot checks: `typescript@5.6.3`, `prettier@3.2.5`, `dotenv@16.4.5` (now a direct
  devDependency at the version npm hoisted).
- Differences: 3. In each case pnpm deduplicated a nested copy onto a version that npm had
  already locked elsewhere in the tree. No version appears that npm did not have.

| Package | npm versions | pnpm versions | Nested npm copies that moved |
|---|---|---|---|
| `ajv` | 6.12.6, 8.12.0, 8.13.0 | 6.12.6, 8.12.0 | `ajv-formats` 8.13.0 → 8.12.0 |
| `debug` | 2.6.9, 4.3.4, 4.4.0, 4.4.3 | 2.6.9, 4.4.3 | 4.3.4 / 4.4.0 → 4.4.3 (babel, eslint, agent-base, https-proxy-agent, istanbul, mquery, superagent, nock, velocityjs) |
| `ms` | 2.0.0, 2.1.2, 2.1.3 | 2.0.0, 2.1.3 | 2.1.2 → 2.1.3 (the same parents as `debug`) |

All three are transitive, and each new resolution satisfies the parent's declared range.
This is a small deviation from "zero differences". It comes from how `pnpm import`
resolves duplicates, not from a range refresh. The PR records it.

## Checkpoint gates

On the checkpoint tree (pnpm 12.5.1, versions as above):

| Gate | Result |
|---|---|
| 1. `pnpm lint:ci` | clean |
| 2. `pnpm test` | 25 of 25 suites, 73 of 73 tests |
| 3. `pnpm test:e2e` | 5 of 5 suites, 126 of 126 tests |
| 4. `pnpm build` | `dist/src/serverless.js` present |
| 5. `pnpm audit --audit-level high` | exit 1, as expected at this point |

`pnpm audit` counts each advisory: 5 critical, 66 high, 48 moderate, 14 low. That is 71
high and critical advisories across 23 packages: `@hapi/content`, `axios`,
`brace-expansion`, `browserslist`, `fast-xml-parser`, `flatted`, `form-data`, `glob`,
`js-yaml`, `jsonpath-plus`, `jws`, `lodash`, `minimatch`, `mongoose`, `multer`,
`path-to-regexp`, `picomatch`, `serialize-javascript`, `tar`, `tmp`, `validator`,
`velocityjs`, `ws`.

## Legacy removal (T017)

- `pnpm build` emits `dist/src/serverless.js` and `dist/database.module.js`.
- `require('./api/index.js')` loads with exit 0. The app bootstraps lazily on the first
  request, so the handler was also invoked once. It passed env validation (the local env
  files are present) and was still waiting on MongoDB after 20 s. That means the whole
  module graph loaded through pnpm's `node_modules` with no `Cannot find module`. The
  task expected a `Config validation error` instead; the missing-module check is what
  FR-015 needs, and it holds.
- Gates 1–4: lint clean, 73 of 73 unit, 126 of 126 e2e, build OK.

## Story 1 checks (local)

| Check | Result |
|---|---|
| T021 npm guard (npm 12.1.0) | exit 1, `notsup … "npm":"please-use-pnpm"`. No `package-lock.json`, no `node_modules` |
| T021 yarn guard (yarn 1.22.22 via `npx`) | exit 1. Refused through `packageManager` ("defines yarn@pnpm@12.5.1"). No `yarn.lock`, no `node_modules` |
| T022 fresh clone, install from README | `pnpm install` OK, `mongodb-memory-server postinstall: Done`, bcrypt built |
| T022 unit coverage (SC-003) | 71.78 / 41 / 38.34 / 69.55, identical to the npm baseline |
| T022 gates 1–4 | lint clean, 73 of 73, 126 of 126, build OK (see the line-ending note below) |
| T022 running app + `/api/health` | **Blocked**: no MongoDB is reachable on this machine (no local mongod, Docker not installed), and `.env.local` points at localhost |
| T023 allowlist enforcement | without the `esbuild` entry: exit 1, `ERR_PNPM_IGNORED_BUILDS … esbuild@0.23.1`. Restored: exit 0 |

**Line-ending note (pre-existing, not caused by pnpm).** On Windows with
`core.autocrlf=true`, a fresh clone checks files out with CRLF, and `lint:ci` fails on
Prettier's `endOfLine: lf`. npm would fail the same way. The gates above ran in a clone
made with `core.autocrlf=false`. Follow-up: add a `.gitattributes` with `* text=auto
eol=lf`.

## Advisory remediation (Story 4, SC-008)

High and critical advisories from `pnpm audit --json`, counted per advisory:

| Step | Commit | High + critical | Packages |
|---|---|---|---|
| Checkpoint | `64f5fa2` | 71 (66 high, 5 critical) | 23 |
| Legacy removal (T029) | `5ec7737` | 49 (46, 3) | 17 |
| Remedy 1: same-major bumps (T030) | `53d3744` | 46 (45, 1) | 14 |
| Remedy 3: bcrypt 6 (T031) | `a8f18dd` | 37 (37, 0) | 13 |
| Remedy 3: Nest CLI 11 (T032) | `f897eae` | 26 (26, 0) | 10 |
| Remedy 2: overrides (T033) | this commit | **0** | 0 |

The post-legacy set matches research R3 exactly, so no new advisory needed adding to the
remedy order.

Final `pnpm audit --audit-level high`: exit 0, 0 high, 0 critical,
`auditConfig.ignoreGhsas` empty. Remaining: **11 moderate, 4 low** (research saw 8 and 1;
more low-severity advisories have been published since). These are out of scope and
listed as a follow-up.

T034 checks:

- Gates 1–4 pass: 73 of 73 unit (coverage still 71.78 / 41 / 38.34 / 69.55), 126 of 126
  e2e, build OK.
- `git diff --stat 64f5fa2..HEAD -- test 'src/**/*.spec.ts'` and `-- src` are both empty
  (FR-018).
- The direct range changes are exactly research R3, T008 and T015. `@nestjs/mapped-types`
  is still `*`, `prettier` `^3.2.5`, `typescript` `^5.4.5`.
- **TypeScript stays at 5.6.3.** Research expected pnpm to dedupe the project onto the
  CLI's pinned 5.9.3. Instead the CLI keeps a private 5.9.3, and lint, jest and
  `nest build` load the project's 5.6.3. The side effect doesn't happen, so the
  "TypeScript 5.6 → 5.9" edit to CLAUDE.md no longer applies.

## Vercel baseline (SC-007)

From the current production deployment, Deployment → Functions → `api/index.js`.

- Function bundle size: TODO(maintainer)
- Cold-start duration: TODO(maintainer)

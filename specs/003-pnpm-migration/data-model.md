# Data Model: Switch the Package Manager from npm to pnpm

**Feature**: [spec.md](./spec.md) | **Date**: 2026-09-21

This feature does not change any MongoDB schema, collection, or document. The "entities"
here are the configuration files that define how the project installs, builds and
deploys. For each one, this page gives its fields, the rules it must satisfy, and the
requirement it serves.

---

## 1. Package manager declaration: `package.json`

| Field | Value after the change | Rule | Serves |
|---|---|---|---|
| `packageManager` | `"pnpm@12.5.1"` | Exact version, no range. Corepack reads it locally, in CI and on Vercel | FR-001 |
| `engines.node` | `"24.x"` (unchanged) | Vercel reads it to pick the runtime | spec 002 |
| `engines.pnpm` | `"12.x"` | pnpm refuses to run under a different major | FR-001 |
| `engines.npm` | `"please-use-pnpm"` | No npm version matches, so npm refuses (with `.npmrc` below) | FR-004 |
| `engines.yarn` | `"please-use-pnpm"` | Same, for yarn | FR-004 |
| `scripts.prebuild` | removed | Its `rimraf` is undeclared, and `nest-cli.json#deleteOutDir` already cleans `dist` | FR-006, FR-010 |
| `scripts.predeploy` | removed | Legacy target; it called `npm install` | FR-010, FR-013 |
| `scripts.heroku-postbuild` | removed | Heroku target | FR-013 |
| `scripts.build-lambda` | removed | Lambda target | FR-013 |
| `dependencies` / `devDependencies` | see [research.md](./research.md) R3 and R9 | Only advisory-driven changes, the legacy removals, and declaring `dotenv` | FR-003, FR-006, FR-013, FR-017 |

**Invariant**: no script body contains `npm ` or `npx `.

## 2. Workspace settings: `pnpm-workspace.yaml` (new)

pnpm 12 reads project settings only from this file. The project stays a single package
and declares no `packages:` list.

| Key | Contents | Rule | Serves |
|---|---|---|---|
| `allowBuilds` | Map of package → `true`/`false` (R5 table) | Every dependency with an install script is listed. CI fails on any unlisted one. `true` only for `bcrypt` and `mongodb-memory-server` | FR-005 |
| `overrides` | 11 entries (R3) | Each key is scoped to the vulnerable major (`name@N`), and each value is a caret range within that same major. No override may name a direct dependency or a `@nestjs/*` package | FR-017 |
| `auditConfig.ignoreGhsas` | Empty list at first | Each entry has a trailing comment: `# <package>: no patched version exists; review YYYY-MM-DD`. An entry is allowed only when no patched version exists | FR-011 |

## 3. Lockfile: `pnpm-lock.yaml` (new) and `package-lock.json` (removed)

| Property | Rule | Serves |
|---|---|---|
| Format | `lockfileVersion: '9.0'`, with `packageManagerDependencies.pnpm` = `12.5.1` | FR-001 |
| Checkpoint state | Produced by `pnpm import`. Resolved versions equal `package-lock.json` for every package | FR-003, SC-004 |
| Final state | Checkpoint plus the removals and upgrades in R3 and R9, and nothing else | FR-017 |
| Exclusivity | `package-lock.json` does not exist in the tree after the checkpoint commit. `yarn.lock` never exists | FR-002 |

**Lifecycle**:

```text
package-lock.json ──pnpm import──▶ pnpm-lock.yaml (checkpoint, versions identical)
    │                                   │
    └── deleted in the same commit      ├─ legacy deps removed
                                        ├─ targeted direct upgrades   (one commit each group)
                                        └─ same-major overrides       (one commit)
                                              ▼
                                        pnpm-lock.yaml (final, 0 high / 0 critical)
```

## 4. npm refusal: `.npmrc` (new, committed)

| Setting | Value | Rule | Serves |
|---|---|---|---|
| `engine-strict` | `true` | Makes npm treat the `engines` mismatch as an error before anything is written | FR-004 |

The file must not hold registry tokens or any other secret (Constitution III).

## 5. Deployment config: `vercel.json`

| Field | Before | After | Serves |
|---|---|---|---|
| `installCommand` | `npm install --include=dev` | `corepack enable pnpm && pnpm install --frozen-lockfile --prod=false` | FR-007 |
| `buildCommand` | `nest build` | unchanged | FR-007 |
| `outputDirectory` | `public` | unchanged (never `.`) | FR-007 |
| `functions["api/index.js"]` | `includeFiles: dist/**`, 1024 MB, 30 s | unchanged | FR-007, FR-008 |
| `rewrites` | `/(.*)` → `/api` | unchanged | FR-007 |

## 6. CI pipeline: `.github/workflows/ci.yml`

| Step | Command | Serves |
|---|---|---|
| Node | `actions/setup-node@v4`, `node-version-file: package.json` (no `cache`) | FR-009 |
| pnpm | `corepack enable pnpm` | FR-001, FR-009 |
| Store cache | `actions/cache@v4` on `pnpm store path`, key `${{ runner.os }}-pnpm-${{ hashFiles('pnpm-lock.yaml') }}` | FR-009, SC-006 |
| Install | `pnpm install --frozen-lockfile` | FR-009 |
| Gate 1 | `pnpm run lint:ci` | FR-009 |
| Gate 2 | `pnpm test -- --coverage` | FR-009 |
| Gate 3 | `pnpm run test:e2e` | FR-009 |
| Gate 4 | `pnpm run build` | FR-009 |
| Gate 5 (new) | `pnpm audit --audit-level high` | FR-009, FR-011 |

## 7. Files removed (FR-013)

`docker/Dockerfile`, `docker/`, `.dockerignore`, `serverless.yml`, `.serverless/` (local
and untracked), `lambda.ts`, `tsconfig.lambda.json`, `Procfile`, `static.json`,
`package-lock.json`.

## 8. Ignore files

| File | Change |
|---|---|
| `.prettierignore` | `package-lock.json` → `pnpm-lock.yaml` |
| `.gitignore` | Add `package-lock.json` and `yarn.lock`, a second guard against committing another lockfile. Drop `.serverless` if it is listed |

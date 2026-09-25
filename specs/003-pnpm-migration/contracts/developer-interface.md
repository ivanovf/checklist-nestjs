# Contract: Developer and Deploy Interface

**Feature**: [../spec.md](../spec.md) | **Date**: 2026-09-21

This feature has two external interfaces. The **HTTP API**, which must not change at all,
and the **command surface** that contributors, CI and Vercel call, which changes from npm
to pnpm.

---

## 1. HTTP API: unchanged (FR-018)

The contract is the generated OpenAPI document and the behaviour the existing suites
assert. After every upgrade step:

- `test/docs/` passes unmodified. It enforces that each route documents the statuses it
  actually returns.
- The e2e suite passes unmodified: 126 tests across 5 suites.
- No file under `src/` changes except where a dependency upgrade forces a type-level
  adjustment. Any such change must keep routes, status codes, validation and response
  shapes identical, and the PR must list it.

A change to any endpoint's observable behaviour is a defect in this feature, not an
accepted consequence.

## 2. Command surface

| Purpose | Before (npm) | After (pnpm) |
|---|---|---|
| Get the package manager | bundled with Node | `corepack enable pnpm` (once per machine) |
| Install | `npm install` / `npm ci` | `pnpm install` / `pnpm install --frozen-lockfile` |
| Dev server | `npm run start:dev` | `pnpm start:dev` |
| Lint gate | `npm run lint:ci` | `pnpm lint:ci` |
| Unit gate | `npm test` | `pnpm test` |
| e2e gate | `npm run test:e2e` | `pnpm test:e2e` |
| Build gate | `npm run build` | `pnpm build` |
| Audit gate | `npm audit` | `pnpm audit --audit-level high` |
| One-off TS script | `npx ts-node scripts/…` | `pnpm exec ts-node scripts/…` |
| Add a dependency | `npm install x` | `pnpm add x` (and review `allowBuilds` if pnpm asks) |

**Guarantees**:
- Script names in `package.json` are unchanged except for the four removed legacy scripts
  (`prebuild`, `predeploy`, `heroku-postbuild`, `build-lambda`), so muscle memory carries
  over by swapping `npm run` for `pnpm`.
- `npm install`, `npm ci` and `yarn` fail immediately with a message naming pnpm, and they
  create no lockfile and no `node_modules`.

## 3. Moving an existing clone from npm (FR-014)

```text
rm -rf node_modules
corepack enable pnpm
pnpm install
```

The resulting tree must pass all five gates. pnpm also replaces an npm-era
`node_modules` on its own without prompting (research R4), so the `rm -rf` is for
certainty, not necessity.

## 4. Deploy interface

Vercel reads `vercel.json#installCommand` (see [data-model.md](../data-model.md) §5). A
deploy is correct when:
- the build log shows `pnpm v12.5.1` running the install;
- `bcrypt install: Done` appears (the native build ran);
- `GET /api/health` on the deployment returns 200 with the database reported as reachable;
- a protected route with no credential is refused exactly as before.

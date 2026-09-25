# Quickstart: Validating the pnpm Switch

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

These are runnable checks that prove the feature works. Each section names the
requirements and success criteria it covers. Configuration shapes are in
[data-model.md](./data-model.md), and the command mapping is in
[contracts/developer-interface.md](./contracts/developer-interface.md).

## 0. Prerequisites

- Node 24.x (`node -v`)
- Docker running, for the local database
- A filled `.env.local` (copy it from `env.example`)
- Before the switch merges, record the **npm baseline** from the current production
  deployment in the Vercel dashboard: function bundle size and cold-start duration of
  `api/index.js` (SC-007).

## 1. The npm guard (FR-004, Story 1 scenario 5)

```sh
rm -rf node_modules
npm install          # expect: "notsup … npm: please-use-pnpm", non-zero exit
ls package-lock.json node_modules   # expect: both missing
```

## 2. Checkpoint lockfile preserves versions (FR-003, SC-004)

On the checkpoint commit (before any upgrade), compare every resolved version in
`pnpm-lock.yaml` with `git show <commit-before-switch>:package-lock.json`. Expect zero
differences, including `typescript@5.6.3` and `prettier@3.2.5`. A small script that reads
both files and prints mismatches is enough. It is a task, not part of the repository.

## 3. Fresh-clone install and the five gates (Story 1, SC-001, SC-003)

```sh
git clone <repo> /tmp/cl && cd /tmp/cl
corepack enable pnpm
pnpm install --frozen-lockfile     # expect: "bcrypt … install: Done", "mongodb-memory-server postinstall: Done"
pnpm lint:ci                       # expect: clean
pnpm test -- --coverage            # expect: 25 suites / 73 tests pass; All files ≥ 71.78 % stmts, auth thresholds hold
pnpm test:e2e                      # expect: 5 suites / 126 tests pass
pnpm build                         # expect: dist/src/serverless.js exists
pnpm audit --audit-level high      # expect: exit 0, no high/critical
```

Then the running app:

```sh
pnpm start:dev
curl -s localhost:3000/api/health   # expect: 200, database reachable
```

## 4. Build-script allowlist is enforced (FR-005)

```sh
rm -rf node_modules
CI=true pnpm install --frozen-lockfile </dev/null; echo $?   # expect: 0
```

Then temporarily delete one `allowBuilds` entry (for example `esbuild`) and repeat. Expect
exit 1 with `ERR_PNPM_IGNORED_BUILDS`. Restore the entry afterwards.

## 5. Vercel preview (Story 2, FR-007, FR-008, SC-002, SC-007)

Push the branch and open the preview build log:

- [ ] Install step shows `pnpm v12.5.1` (not a Vercel-chosen version)
- [ ] `bcrypt … install: Done` is present
- [ ] Build completes with `nest build`

On the preview URL:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://<preview>/api/health            # expect 200, db reachable in body
curl -s -o /dev/null -w '%{http_code}\n' https://<preview>/api/<protected-route>  # expect the same refusal status as production
```

- [ ] The function logs for the first (cold) request show no `Cannot find module`
- [ ] Bundle size and cold start are within 10 % of the npm baseline from §0

If the install step fails at `corepack enable`, apply the fallback in
[research.md](./research.md) R4 and repeat this section.

## 6. CI (Story 3, FR-009, SC-006)

Open the PR and check:

- [ ] The install step uses `--frozen-lockfile`
- [ ] All five gate steps run, and the audit step is green
- [ ] Re-run the workflow with no changes: the cache step reports a hit, and the install
  is faster than the first run

Negative check (optional, on a throwaway branch): add a dependency with a known high
advisory. The audit step must fail.

## 7. No npm instructions remain (FR-012, SC-005)

```sh
git grep -nE '\bnpm (i|install|ci|run|test|audit)\b|\bnpx\b' -- . ':!specs/001-*' ':!specs/002-*'
```

Expect matches only inside `specs/003-pnpm-migration/` (where the migration itself is
described). Registry badge URLs do not match this pattern.

## 8. Upgrades did not change the API (FR-018, Story 4)

- [ ] `test/docs/`, e2e and unit suites pass with **no** test file modified in the upgrade
  commits (`git diff --stat <checkpoint>..HEAD -- test src/**/*.spec.ts` shows nothing)
- [ ] `pnpm audit --audit-level high` exit 0 and `auditConfig.ignoreGhsas` is empty (SC-008)

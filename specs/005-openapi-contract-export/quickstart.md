# Quickstart: Validating the Exported API Contract

**Feature**: `specs/005-openapi-contract-export`

Run these after implementation to prove each user story end to end. The command
contracts are in [contracts/commands.md](./contracts/commands.md), and the rules the
checks enforce are in
[contracts/documentation-conventions.md](./contracts/documentation-conventions.md).

## Prerequisites

- Node 24 and pnpm via Corepack, with `pnpm install` done.
- For §3 only: Docker and the local database from feature 004 (`pnpm db:setup`).
- Performance note: from a checkout on `/mnt/c` under WSL, module loading alone takes
  about a minute (research R9). A clone inside the WSL home directory is much faster.

## 1. Offline export (US1)

```sh
docker compose --env-file .env.local stop 2>/dev/null   # prove no database is needed
mv .env.local .env.local.bak 2>/dev/null                # prove no config file is needed
pnpm docs:export
mv .env.local.bak .env.local 2>/dev/null
```

Expect:
- Exit 0, and `openapi.json` written at the repository root.
- `node -e 'const d=require("./openapi.json");console.log(Object.values(d.paths).reduce((n,p)=>n+Object.keys(p).length,0))'`
  prints `38`.
- Running `pnpm docs:export` a second time leaves `git status` clean. The output is
  deterministic.
- `grep -ci password openapi.json`: any match is in a **request** schema
  (`CreateUserDto`, `UpdateUserDto`, `LoginRequestDto`), never in a response schema.

## 2. Drift is caught (US3)

```sh
pnpm build && pnpm docs:check          # expect exit 0
```

Rename a property in one request DTO, for example `CreateLockDto.lock` to `lockName`, and
do **not** re-export:

```sh
pnpm build && pnpm docs:check          # expect exit 1 and the "out of date" message
pnpm docs:export && pnpm docs:check    # expect exit 0
git checkout -- src openapi.json       # undo the experiment
```

Remove `@ApiOperation` from one route, re-export, and run `pnpm test:e2e test/docs`.
Expect a completeness failure naming that operation. Then undo the change.

## 3. The contract matches reality (US2)

With the local database up (`pnpm db:setup`) and `pnpm start:dev` running, use only
`openapi.json` to build each call:

| Call | Expect |
|---|---|
| `POST /api/login` with the documented body and the seeded admin | 201 (as documented), with `access_token` and `user` |
| `GET /api/users/all` without `limit`/`offset` | 400. The contract marks both required (D1) |
| `GET /api/users/all?limit=10&offset=0` with the token | 200. The body keys match `UserResponseDto` |
| `GET /api/items/<unknown id>` with the token | 200, empty body, as documented (D2) |
| any `admin` route with a non-admin token | 403, listed in its refusals |
| `PATCH /api/config/:id` without the device key | 401, and no 403 documented |

The automated equivalents are in `test/docs/` and run with `pnpm test:e2e`.

## 4. All gates

```sh
pnpm lint:ci && pnpm test && pnpm test:e2e && pnpm build && pnpm docs:check && pnpm audit --audit-level high
```

All must pass. `docs:check` runs inside the Build gate in CI.

## Results (2026-09-28, WSL on `/mnt/c`)

- §1 ✅ `pnpm docs:export` with `.env.local` moved aside and the database host forced
  unreachable: exit 0, 38 operations, and a second run byte-identical. No local config value
  appears in the file. It took 2 min 49 s locally; loading modules from `/mnt/c` dominates
  (research R9). CI timing is not yet measured, because GitHub Actions is billing-locked.
- §2 ✅ Drift: renaming `CreateLockDto.lock` gives exit 1 with "First difference: schema
  CreateLockDto". Re-export gives exit 0. Removing one `@ApiOperation` fails exactly one
  check 2 test, which names `post /api/locks`.
- §3 ✅ Every route was called against the local Compose database before being documented.
  Sign-in → 201, `users/all` without paging → 400 (D1), unknown item → 200 with an empty
  body (D2), non-admin on admin routes → 403 (matrix suite), and the device route without a
  token → 401. Automated equivalents are in `test/docs/`.
- §4 Gates: lint ✅ · unit 154/154 ✅ · e2e 359/359 ✅ · build ✅ · docs:check ✅ · audit ✅
  (4 low, 11 moderate, none high or critical, all pre-existing).
  **Coverage:** `src/auth` 100% of lines. Overall 77.8% of lines, **below the 80% floor**
  (jest enforces only the `src/auth` threshold). Every line this feature adds is covered
  (`src/openapi`, `src/common`: 100%), so it cannot lower the overall figure. The gap
  predates this feature: `bootstrap.ts` and `serverless.ts` at 0%, `validators` at 36%.

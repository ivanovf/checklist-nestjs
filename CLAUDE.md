# checklist-api

A NestJS + MongoDB REST API that runs a chalet's reservations and its check-in/check-out checklists: users, items, locks, activities, and device configuration.

## Stack & decisions
- **Node 24.x**, TypeScript 5.6 (strict), NestJS 10 on Express, Mongoose 8, MongoDB Atlas via `mongodb+srv`.
- **pnpm 12 via Corepack** (`packageManager` pinned). npm and yarn are refused. Install scripts run only for packages allowed in `pnpm-workspace.yaml#allowBuilds`; an unlisted one fails CI.
- **Auth**: Passport JWT + local, bcrypt. Sign-in and recovery completion are throttled by `@nestjs/throttler` (5 a minute per source) in **memory, per serverless instance**: the Mongo-backed lockout planned in 001 (research R5, tasks T051–T062) was never built. Treat the throttle as defence in depth; a limit that must hold across instances lives in Mongo, as the recovery attempt counter does (specs/012-password-recovery). Password recovery: an admin issues a one-time code (`POST /api/password-recovery/:userId/code`), the holder sets a new password (`POST /api/password-recovery/complete`), and sessions issued before it are refused.
- **Hardening**: helmet, `@nestjs/throttler`, global `RequestValidationPipe` (strict bodies and queries; a change may repeat its own `_id`), joi validates env at startup. The app fails fast on bad config.
- **Deploy**: Vercel serverless, the only target. `src/serverless.ts` caches one app per instance (`app.init()`, never `listen()`). `api/index.js` is the shim. `outputDirectory: "public"` holds only `robots.txt`. Never set it to `.`.
- **Config gotchas**: keep the DB name out of the URI path, or auth fails. `CORS_ORIGINS` is required in production; `none` means no browser clients (current: the Flutter app is native). Swagger (`/docs`) is served only locally.
- All routes are under `/api`. `GET /api/health` returns 503 unless Mongo `readyState === 1`.

## Run & test locally
```sh
cp env.example .env.local   # then fill in credentials
corepack enable pnpm        # once per machine
pnpm install
pnpm db:setup               # Docker Mongo on a named volume + seed dev.admin@localhost.test
pnpm start:dev              # http://localhost:3000/api, docs at /docs
pnpm lint:ci && pnpm test && pnpm test:e2e && pnpm build && pnpm docs:check && pnpm audit --audit-level high
```
- The e2e suite uses `mongodb-memory-server` and must stay `--runInBand` (one shared mongod).
- `pnpm db:reset` wipes the local volume.
- `pnpm verify` runs the gates on the committed HEAD: lint, unit tests with coverage, build, `docs:check` and audit (about 9 minutes on `/mnt/c`). It needs a clean tree. e2e runs only with `VERIFY_E2E=1 pnpm verify`. The `pre-push` hook in `.githooks/` refuses to push any commit that `pnpm verify` hasn't passed, and any push to `main` or `dev`. It lets through a commit that descends from the verified one and since then changes only `*.md`, `specs/`, `.specify/` or `.claude/`, because no gate reads those. `pnpm install` switches the hook on (`prepare` sets `core.hooksPath`). `git push --no-verify` bypasses it, and the PR must then say so.
- `pnpm docs:export` rebuilds and writes `openapi.json`, the committed API contract. It needs no database. `pnpm docs:check` compares the current build with it; CI runs it in the Build step.

## Conventions
- Spec Kit flow per feature: `/speckit-specify → clarify → plan → tasks → analyze → implement`, with artifacts in `specs/NNN-name/`.
- Git flow: `dev` is the integration branch, `main` is production. Every branch starts from an up-to-date `dev` (`git switch dev && git pull`, then branch; `/speckit-git-feature` branches from the current HEAD, so be on `dev` first). Open its PR against `dev` (`gh pr create --base dev`). Once it's approved and merged, `main` is updated by a PR from `dev` to `main`. **Never commit to `main` or `dev` directly.** Check the branch before every commit.
- Commits: imperative summary line, no `feat:`/`fix:` prefix, and a body that explains why.
- Test-first. Coverage floors are 80% overall and 90% for `src/auth`. The five gates are lint, test, e2e, build, and audit. GitHub Actions is billing-locked and paid CI is not wanted for this personal app, so `pnpm verify` and the local `pre-push` hook enforce them. State the e2e result in every PR.
- Layering: controllers are HTTP-only, services own rules and are the only layer that touches models, and responses are projected through DTOs. No `any`.
- Every endpoint needs `@ApiTags`, `@ApiOperation`, a success response with its body type (documentation-only `*-response.dto.ts` classes), and `@ApiRefusals(...)` from `src/common/decorators/`. Document only statuses the route really returns. `test/docs/` enforces this: completeness, agreement with the authorization matrix, a sample called for real, and one test per recorded discrepancy.
- A change to any route's inputs, outputs or access must regenerate and commit `openapi.json` in the same PR. Where behaviour and apparent intent disagree, the contract states the behaviour and `specs/005-openapi-contract-export/discrepancies.md` records the gap.
- Verify behaviour by running it, not by reading the source. Code that reads as correct has repeatedly behaved otherwise: by-id routes that looked like they threw 404 answered an empty 200 (D2), and a reservation list that looked bounded returned every record (D11).

The product rules live in .specify/memory/constitution.md
The product state lives in specs/README.md

# checklist-api

A NestJS + MongoDB REST API that runs a chalet's reservations and its check-in/check-out checklists: users, items, locks, activities, and device configuration.

## Stack & decisions
- **Node 24.x**, TypeScript 5.6 (strict), NestJS 10 on Express, Mongoose 8, MongoDB Atlas via `mongodb+srv`.
- **pnpm 12 via Corepack** (`packageManager` pinned). npm and yarn are refused. Install scripts run only for packages allowed in `pnpm-workspace.yaml#allowBuilds`; an unlisted one fails CI.
- **Auth**: Passport JWT + local, bcrypt. Sign-in throttling is persisted in Mongo, not memory, because serverless instances are short-lived.
- **Hardening**: helmet, `@nestjs/throttler`, global `ValidationPipe`, joi validates env at startup. The app fails fast on bad config.
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
- `pnpm docs:export` rebuilds and writes `openapi.json`, the committed API contract. It needs no database. `pnpm docs:check` compares the current build with it; CI runs it in the Build step.

## Conventions
- Spec Kit flow per feature: `/speckit-specify → clarify → plan → tasks → analyze → implement`, with artifacts in `specs/NNN-name/`.
- Branch per feature and merge by PR. **Never commit to `main`.** Check the branch before every commit.
- Commits: imperative summary line, no `feat:`/`fix:` prefix, and a body that explains why.
- Test-first. Coverage floors are 80% overall and 90% for `src/auth`. The five gates are lint, test, e2e, build, and audit, all enforced in CI.
- Layering: controllers are HTTP-only, services own rules and are the only layer that touches models, and responses are projected through DTOs. No `any`.
- Every endpoint needs `@ApiTags`, `@ApiOperation`, a success response with its body type (documentation-only `*-response.dto.ts` classes), and `@ApiRefusals(...)` from `src/common/decorators/`. Document only statuses the route really returns. `test/docs/` enforces this: completeness, agreement with the authorization matrix, a sample called for real, and one test per recorded discrepancy.
- A change to any route's inputs, outputs or access must regenerate and commit `openapi.json` in the same PR. Where behaviour and apparent intent disagree, the contract states the behaviour and `specs/005-openapi-contract-export/discrepancies.md` records the gap.
- Verify behaviour by running it, not by reading the source. Several by-id routes return 200 with an empty body despite code that looks like it throws 404.

The product rules live in .specify/memory/constitution.md
The product state lives in specs/README.md

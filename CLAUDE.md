# checklist-api

A NestJS + MongoDB REST API that runs a chalet's reservations and its check-in/check-out checklists: users, items, locks, activities, and device configuration.

## Stack & decisions
- **Node 24.x**, TypeScript 5.6 (strict), NestJS 10 on Express, Mongoose 8, MongoDB Atlas via `mongodb+srv`.
- **Auth**: Passport JWT + local, bcrypt. Sign-in throttling is persisted in Mongo, not memory, because serverless instances are short-lived.
- **Hardening**: helmet, `@nestjs/throttler`, global `ValidationPipe`, joi validates env at startup. The app fails fast on bad config.
- **Deploy**: Vercel serverless. `src/serverless.ts` caches one app per instance (`app.init()`, never `listen()`). `api/index.js` is the shim. `outputDirectory: "public"` holds only `robots.txt`. Never set it to `.`.
- **Config gotchas**: keep the DB name out of the URI path, or auth fails. `CORS_ORIGINS` is required in production; `none` means no browser clients (current: the Flutter app is native). Swagger (`/docs`) is served only locally.
- All routes are under `/api`. `GET /api/health` returns 503 unless Mongo `readyState === 1`.

## Run & test locally
```sh
cp env.example .env.local   # then fill in credentials
npm run db:setup            # Docker Mongo on a named volume + seed dev.admin@localhost.test
npm run start:dev           # http://localhost:3000/api, docs at /docs
npm run lint:ci && npm test && npm run test:e2e && npm run build
```
- The e2e suite uses `mongodb-memory-server` and must stay `--runInBand` (one shared mongod).
- `npm run db:reset` wipes the local volume.

## Conventions
- Spec Kit flow per feature: `/speckit-specify → clarify → plan → tasks → analyze → implement`, with artifacts in `specs/NNN-name/`.
- Branch per feature and merge by PR. **Never commit to `main`.** Check the branch before every commit.
- Commits: imperative summary line, no `feat:`/`fix:` prefix, and a body that explains why.
- Test-first. Coverage floors are 80% overall and 90% for `src/auth`. The five gates are lint, test, e2e, build, and audit.
- Layering: controllers are HTTP-only, services own rules and are the only layer that touches models, and responses are projected through DTOs. No `any`.
- Every endpoint needs `@ApiTags`, `@ApiOperation`, a success response, and `@ApiRefusals(...)`. Document only statuses the route really returns; `test/docs/` enforces this.
- Verify behaviour by running it, not by reading the source. Several by-id routes return 200 with an empty body despite code that looks like it throws 404.

The product rules live in .specify/memory/constitution.md
The product state lives in specs/README.md

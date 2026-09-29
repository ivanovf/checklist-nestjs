# Quickstart: Validate Reservation Paging

**Feature**: `specs/006-fix-reservation-paging`. Expected results are in
[contracts/reservation-list.md](contracts/reservation-list.md).

## 1. Automated (what CI runs)

```sh
pnpm lint:ci && pnpm test && pnpm test:e2e && pnpm build && pnpm docs:check && pnpm audit --audit-level high
```

These must pass:

- `test/reservations/reservation-paging.e2e-spec.ts` (new): seeds 25 reservations with
  shared start dates, then covers User Stories 1–3, the default bound of 10, the maximum of
  50, the newest-first default, `old=false`, and full coverage of all pages with no repeats.
- `test/docs/contract-discrepancies.e2e-spec.ts`: the D11 test is gone, and every other
  entry is still green.
- `test/docs/*`: contract completeness and the sample test agree with the regenerated
  `openapi.json`.
- `pnpm docs:check`: the committed `openapi.json` matches the build.

## 2. Manually, against local Mongo

```sh
pnpm db:setup && pnpm start:dev
TOKEN=$(curl -s localhost:3000/api/login -H 'content-type: application/json' \
  -d '{"email":"dev.admin@localhost.test","password":"<seed password>"}' | jq -r .access_token)
H="Authorization: Bearer $TOKEN"
```

Seed more than 10 reservations first (with `POST /api/reservations`, or through Swagger at
`/docs`), then check each row:

| Command | Expect |
|---|---|
| `curl -s -H "$H" 'localhost:3000/api/reservations/all' \| jq length` | ≤ 10 |
| `curl -s -H "$H" 'localhost:3000/api/reservations/all?sort=asc&limit=50&offset=0' \| jq length` | ≤ 50, 200 |
| `curl -s -o /dev/null -w '%{http_code}' -H "$H" 'localhost:3000/api/reservations/all?sort=asc&limit=200&offset=0'` | 400 |
| Page with `limit=5` and offsets 0, 5, 10, … and collect the `_id`s | no duplicates, union equals the full set |
| `curl -s -H "$H" 'localhost:3000/api/reservations/all' \| jq '.[0].dateIni'` | the latest start date |

The login body fields and the seed password are set by `scripts/seed-dev-admin.ts` and your `.env.local`; `/docs` shows the login schema.

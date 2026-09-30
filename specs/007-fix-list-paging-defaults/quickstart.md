# Quickstart: Validate List Paging

**Feature**: `specs/007-fix-list-paging-defaults`. Expected results are in
[contracts/list-paging.md](contracts/list-paging.md).

## 1. Automated

```sh
pnpm lint:ci && pnpm test && pnpm test:e2e && pnpm build && pnpm docs:check && pnpm audit --audit-level high
```

These must pass:

- `test/docs/pagination-query.e2e-spec.ts`: rewritten from the D4/D1 pin into the regression
  suite. It covers the status table for all three routes, plus stepping through 15 seeded
  records of each list, with every record appearing exactly once.
- `test/docs/contract-discrepancies.e2e-spec.ts`: the D1 case is gone, and every other entry
  is still green.
- `test/reservations/reservation-paging.e2e-spec.ts` (006): still green after the paging rules
  moved to `PaginationQueryDto`.
- `pnpm docs:check`: `openapi.json` changes only under the three routes, not under
  `/api/reservations/all`.

## 2. Manually, against the running dev server

Sign in as in `specs/006-fix-reservation-paging/quickstart.md`, then:

| Command | Expect |
|---|---|
| `curl -s -H "$H" localhost:3000/api/items/all \| jq length` | 200, ≤ 10 |
| `curl -s -o /dev/null -w '%{http_code}' -H "$H" 'localhost:3000/api/users/all?offset=0'` | 200 |
| `curl -s -H "$H" 'localhost:3000/api/locks/all?limit=1000'` | 400, `limit must not be greater than 50` |
| `curl -s -o /dev/null -w '%{http_code}' -H "$H" 'localhost:3000/api/items/all?offset=-1'` | 400 (was 500) |

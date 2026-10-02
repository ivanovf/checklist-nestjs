# Quickstart: Validate Bounded Paging on the Activity, Activity Type and Configuration Lists

**Feature**: `specs/011-fix-unbounded-lists`. Expected results are in
[contracts/list-paging.md](contracts/list-paging.md).

## 1. Automated

```sh
pnpm lint:ci && pnpm test && pnpm test:e2e && pnpm build && pnpm docs:check && pnpm audit --audit-level high
```

These must pass:

- `test/docs/pagination-query.e2e-spec.ts`: now also covers `/api/activity-type` and
  `/api/config`, with the same status table and stepping through 15 records, oldest first.
- `test/activity/activity-paging.e2e-spec.ts` (new):
  - default page, newest first;
  - stepping through 15 activities that share dates, each seen exactly once;
  - paging combined with each filter;
  - the invalid-value table;
  - the populated `type` is still present.
- `test/docs/contract-discrepancies.e2e-spec.ts`: the D6 case is gone, and every other entry
  is still green.
- `src/activity/entities/activity.entity.spec.ts` (new): the four indexes are declared.
- `pnpm docs:check`: `openapi.json` changes only under the three operations.

## 2. Manually, against the running dev server

Sign in as in `specs/006-fix-reservation-paging/quickstart.md` (an administrator token in
`$H`), then:

| Command | Expect |
|---|---|
| `curl -s -H "$H" localhost:3000/api/activity \| jq length` | ≤ 10 |
| `curl -s -H "$H" 'localhost:3000/api/activity-type?limit=50' \| jq length` | ≤ 50 |
| `curl -s -H "$H" 'localhost:3000/api/config?limit=1000'` | 400, `limit must not be greater than 50` |
| `curl -s -o /dev/null -w '%{http_code}' -H "$H" 'localhost:3000/api/activity?offset=-1'` | 400 (was 200) |

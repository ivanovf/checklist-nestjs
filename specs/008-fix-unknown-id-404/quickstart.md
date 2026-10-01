# Quickstart: Validate Unknown and Malformed Ids

**Feature**: `specs/008-fix-unknown-id-404`. Expected results are in
[contracts/by-id-routes.md](contracts/by-id-routes.md).

## 1. Automated

```sh
VERIFY_E2E=1 pnpm verify     # lint, unit + coverage, build, docs:check, audit, e2e
```

These must pass:

- `test/records/record-ids.e2e-spec.ts` (new): all 20 operations with an unknown id → 404
  and with `abc` → 400, plus a create → read → delete → read again (404) → delete again (404)
  round trip per kind.
- `test/docs/*`: the D2 and D7 cases are removed. Completeness, the matrix agreement and the
  sample calls are green against the regenerated `openapi.json`.
- `test/security/authorization-matrix.e2e-spec.ts`: unchanged and green.

## 2. Manually, against a local server

Sign in as in `specs/006-fix-reservation-paging/quickstart.md`, then:

| Command | Expect |
|---|---|
| `curl -s -w ' %{http_code}' -H "$H" localhost:3000/api/items/6aba80d38c58c96b58020000` | 404 `item #… not found` |
| `curl -s -w ' %{http_code}' -X DELETE -H "$H" localhost:3000/api/locks/abc` | 400 `Invalid id "abc"` |
| `curl -s -w ' %{http_code}' -H "$H" localhost:3000/api/activity-type/abc` | 400 (was 500) |

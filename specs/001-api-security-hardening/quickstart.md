# Quickstart: Validating API Security Hardening

**Feature**: `001-api-security-hardening` | **Date**: 2026-09-07

How to prove each user story works end to end. Each section stands alone, matching the
independently-shippable structure of the spec — you can validate US1 without US2–US5 existing.

---

## Prerequisites

- Node.js 18 and `npm ci` completed.
- No external MongoDB needed: integration and e2e suites run against `mongodb-memory-server`.
- A local `.env.local` satisfying [contracts/configuration.md](./contracts/configuration.md).
  Note `SECRET` and `TANK_API_KEY` now require at least 32 characters — an existing shorter value
  will (correctly) stop the service from starting.

```bash
npm ci
npm run build          # must compile clean
```

---

## Full gate run

The five gates the constitution requires, in the order CI runs them:

```bash
npm run lint
npm test               # unit; coverage floors apply to src/auth/** and changed files
npm run test:e2e       # the five security suites below
npm run build
npm audit --audit-level=high
```

All five must pass before this feature is considered done.

---

## US1 — Role restrictions are actually enforced *(P1)*

The primary suite. Table-driven from
[contracts/authorization-matrix.md](./contracts/authorization-matrix.md): every route is exercised
as anonymous, as `authenticated`, and as `admin`.

```bash
npm run test:e2e -- authorization-matrix
```

**Expected**: all 37 routes × 3 caller types assert as the matrix states. Specifically, an
`authenticated` caller receives `403` on all 12 administrator-only routes, and `401` where
anonymous.

**Manual confirmation of the headline defect** — this is the one to run by hand, because it is what
the feature exists to fix. Against the service *before* the change, step 3 succeeds; after, it
returns `403`:

```bash
# 1. sign in as a non-administrator
TOKEN=$(curl -s -X POST localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"guest@example.com","password":"..."}' | jq -r .access_token)

# 2. confirm the token works for a permitted read
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/reservations/all \
  -H "Authorization: Bearer $TOKEN"          # expect 200, before and after

# 3. attempt an administrator-only delete
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE localhost:3000/api/reservations/<id> \
  -H "Authorization: Bearer $TOKEN"          # BEFORE: 200 — the defect. AFTER: 403
```

**Also assert**: the reservation still exists after step 3 — a refusal must have no side effect.

**Guard against regression**: the suite fails if the application registers a route that the matrix
does not list, so a new unlisted endpoint cannot ship.

**Current-role check (FR-005)**: sign in as an administrator, keep the token, demote the account to
`authenticated` directly in the database, then call an administrator-only route with the same
token. Expect `403`, not success.

---

## US2 — The service refuses to run misconfigured *(P1)*

```bash
npm run test:e2e -- config-validation
```

**Expected**: for each required value in
[contracts/configuration.md](./contracts/configuration.md), starting without it exits non-zero and
names that value.

**Manual**:

```bash
SECRET= npm start          # expect: exits naming SECRET, no socket opened
SECRET=short npm start     # expect: exits naming the 32-character minimum
NODE_ENV=production CORS_ORIGINS= npm start   # expect: exits naming CORS_ORIGINS
```

**Secret scan** — no credential literals remain (FR-010, FR-012):

```bash
npx gitleaks detect --no-git --redact
```

Expect zero findings. Before the change this reports the `'mytoken'` literal in
`src/auth/guards/api-key.guard.ts`.

---

## US3 — Sign-in attempts are throttled *(P2)*

```bash
npm run test:e2e -- login-throttling
```

**Manual**:

```bash
# 6 attempts with a wrong password against one account
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "attempt $i: %{http_code}\n" -X POST localhost:3000/api/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"owner@example.com","password":"wrong"}'
done
```

**Expected**: attempts 1–5 return `401`, attempt 6 returns `429` with `retryAfterSeconds`. Then:

- The **correct** password during the lockout still returns `429` — the password is not evaluated.
- Restart the service and retry: still `429`. This is the serverless property (FR-016) and the
  reason state is persisted rather than in memory.
- After the lockout window, the correct password signs in normally.
- Four failures followed by a correct password succeed — legitimate users below the threshold are
  never affected.

**Timing indistinguishability (FR-015)** — compare an unknown account against a known account with
a wrong password:

```bash
curl -s -o /dev/null -w 'unknown:  %{time_total}s\n' -X POST localhost:3000/api/login \
  -H 'Content-Type: application/json' -d '{"email":"nobody@example.com","password":"x"}'
curl -s -o /dev/null -w 'wrongpw:  %{time_total}s\n' -X POST localhost:3000/api/login \
  -H 'Content-Type: application/json' -d '{"email":"owner@example.com","password":"x"}'
```

**Expected**: comparable timings. Before the change the unknown-account path returns roughly an
order of magnitude faster, because it never reaches the password comparison.

---

## US4 — Only approved sites can call the API from a browser *(P2)*

```bash
npm run test:e2e -- cors
```

**Manual**:

```bash
# an origin that is not on the allowlist
curl -s -D - -o /dev/null localhost:3000/api/reservations/all -H 'Origin: https://evil.example'
# an approved origin
curl -s -D - -o /dev/null localhost:3000/api/reservations/all -H 'Origin: https://<approved>'
```

**Expected**: no `Access-Control-Allow-Origin` header for the unapproved origin; the correct origin
echoed for the approved one. Before the change, every origin is approved.

Also: with `NODE_ENV=production` and no `CORS_ORIGINS`, the service must refuse to start (FR-018) —
covered above in US2.

> The approved origin values are the one input still needed from the owner. Until they are
> supplied, this story can be validated with placeholder values locally but cannot be released to a
> deployed environment.

---

## US5 — Responses carry protective headers *(P3)*

```bash
npm run test:e2e -- response-headers
```

**Manual**:

```bash
curl -s -D - -o /dev/null localhost:3000/api
```

**Expected**: the agreed header set present; **no** `x-powered-by` (FR-020). Then confirm errors
disclose nothing — see [contracts/error-shape.md](./contracts/error-shape.md):

```bash
curl -s localhost:3000/api/reservations/not-a-valid-id -H "Authorization: Bearer $TOKEN"
```

**Expected**: a generic `400` in the standard shape. Before the change this surfaces the underlying
cast error with data-store detail.

---

## Confirming nothing regressed

The feature must be invisible to legitimate users (SC-009):

- Sign in as administrator and as guest — both succeed, response bodies unchanged.
- Every operation each role was legitimately permitted before still succeeds.
- The device integration continues to update the tank level, now sending its configured key.
- The front end works with no change beyond its origin being on the allowlist.

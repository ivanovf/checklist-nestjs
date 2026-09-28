# Quickstart: Validating the Local MongoDB Setup

**Feature**: `specs/004-local-mongo-compose` | **Date**: 2026-09-18

A validation guide, not an implementation guide. Shapes and rules live in
[data-model.md](./data-model.md) and [contracts/](./contracts/) rather than being repeated.

## Prerequisites

| Requirement | Check |
|---|---|
| Container runtime | `docker compose version` |
| Node 24 | `node -v` |
| No database on the configured port | `lsof -nP -iTCP:27017 -sTCP:LISTEN` returns nothing |

---

## Scenario 1 — Clone to running service (US1, SC-001)

The headline claim: under 5 minutes, no more than 3 commands, from a clone with no local
configuration.

```bash
cp env.example .env.local
pnpm db:setup
pnpm start:dev          # in a second terminal
```

**Expected**: three commands, matching SC-001's budget, each succeeding unedited. `env.example` must work as copied — if it
requires inventing a password before anything starts, the budget is blown and the scenario
fails.

Confirm the service reached the database:

```bash
curl -s localhost:3000/api/health
```

**Expected**: `{"status":"ok","database":"up"}`. A 503 means the service started but the
database is not reachable; no response at all means the service is still hanging on its
connection — see Scenario 5.

---

## Scenario 2 — Sign in and use an admin route (US2, SC-002, SC-003)

The scenario that distinguishes "a database runs" from "the environment works".

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<seed email>","password":"<seed password>"}' | jq -r .access_token)

curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/users/all \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: a token comes back, and the admin-only route answers **200**. A 401 on the
first call means seeding did not run; a 403 on the second means the account exists without
administrator rights — the third row of the seed contract.

No manual database manipulation is permitted anywhere in this scenario. Needing it means the
feature has not delivered.

---

## Scenario 3 — Seeding is idempotent (US2, FR-009)

```bash
pnpm db:seed
pnpm db:seed          # again
```

**Expected**: the second run succeeds and reports the account already exists. Then confirm
there is exactly one:

```bash
docker compose --env-file .env.local exec mongo \
  mongosh -u "$DB_USER" -p "$DB_PASS" --quiet \
  --eval 'db.getSiblingDB("checklist").users.countDocuments({email:"<seed email>"})'
```

**Expected**: `1`. A `2` means the seed is not idempotent — the common failure, and one that
surfaces later as confusing sign-in behaviour rather than an obvious error.

---

## Scenario 4 — Data persists, and reset works (US3, SC-004 – SC-006)

```bash
# write something, then:
pnpm db:down
pnpm db:up
# confirm the record is still there
```

**Expected**: data survives the restart.

```bash
git status --porcelain        # expect: nothing database-shaped
pnpm db:reset
pnpm db:setup
```

**Expected**: a clean database, and the first sign-in works again. The `git status` check
should find nothing: database files live in a named volume outside the working tree, so there
is no directory entry to ignore in the first place.

---

## Scenario 5 — The failure mode worth rehearsing (FR-015)

Start the service with the database stopped:

```bash
pnpm db:down
pnpm start:dev
```

**Expected**: the service **hangs**. It does not error, does not exit, and never serves a
route — not even `/api/health`. This is the documented symptom, and the reason the setup
order matters. Confirm the documentation says so; a developer hitting this with no warning
will read it as a broken application.

Recovery is `pnpm db:up`, then restart the service.

---

## Scenario 6 — Nothing leaked into deployment or tests (FR-012, FR-013, SC-007, SC-008)

```bash
pnpm lint:ci
NODE_ENV=local npm test -- --coverage
NODE_ENV=local pnpm test:e2e        # with the local database running
pnpm db:down
NODE_ENV=local pnpm test:e2e        # and with it stopped
pnpm build
```

**Expected**: all four gates pass, and **the two end-to-end runs produce identical results**.
The suite uses its own in-memory database; if stopping the local one changes anything, the
isolation has been broken.

Also confirm no committed file carries a real credential:

```bash
grep -rnE "(DB_PASS|SECRET|TANK_API_KEY)=" compose.yaml env.example
```

**Expected**: matches in `env.example` show placeholders only, and `compose.yaml` shows
interpolation (`${DB_PASS}`), never a literal.

---

## Post-setup checks

| Check | Pass condition |
|---|---|
| `/api/health` | 200 with `database: "up"` |
| First sign-in | Succeeds with the documented credentials |
| Admin route with that token | 200 |
| `git status` | Nothing database-shaped |
| Both e2e runs | Identical |
| Deployment | Unaffected — nothing here is referenced |

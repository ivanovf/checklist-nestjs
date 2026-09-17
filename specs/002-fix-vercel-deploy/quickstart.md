# Quickstart: Validating the Vercel Deployment Configuration

**Feature**: `specs/002-fix-vercel-deploy` | **Date**: 2026-09-17

A validation guide, not an implementation guide. Each scenario maps to acceptance criteria
in [spec.md](./spec.md); shapes and values live in [data-model.md](./data-model.md) and
[contracts/](./contracts/) rather than being repeated here.

## Prerequisites

| Requirement | Check |
|---|---|
| Node 24 locally | `node -v` → `v24.x` (`nvm install 24`; the machine currently runs 22.12.0) |
| Dependencies installed | `npm install --include=dev` |
| Local env file | `.env.local` present and untracked |
| `CORS_ORIGINS` locally | Optional — absence is a valid local case worth testing |

## The four gates

Run exactly what CI runs. All four must pass before the branch is deployable.

```bash
npm run lint:ci                  # read-only; must not modify files
NODE_ENV=local npm test -- --coverage
NODE_ENV=local npm run test:e2e
npm run build
```

Coverage floors: 80% overall, 90% for `src/auth/**`. This feature adds code under
`src/health/` and modifies `src/bootstrap.ts`, so expect the overall figure to move — do
not let it drop below the floor.

---

## Scenario 1 — A clean checkout builds (US1, FR-001)

Proves nothing gitignored is load-bearing. This is how the platform sees the repository.

```bash
git clone --no-hardlinks . /tmp/deploy-check && cd /tmp/deploy-check
git checkout <branch>
npm install --include=dev        # the platform's installCommand
npx nest build                   # the platform's buildCommand
ls dist/src/serverless.js        # must exist where api/index.js expects it
ls public/robots.txt             # the published static surface
```

**Expected**: install and build both succeed; both files present; no `.env` file needed.

---

## Scenario 2 — The handler serves with environment variables only (US1)

The deployed service has no env file — configuration arrives as environment variables.

```bash
cd /tmp/deploy-check
set -a && . /path/to/repo/.env.production && set +a
export CORS_ORIGINS="https://example.test"
NODE_ENV=production node -e '
  const http=require("http"), h=require("./api/index.js");
  const s=http.createServer((q,r)=>h(q,r));
  s.listen(4399,async()=>{
    const get=p=>new Promise(ok=>http.get({port:4399,path:p},r=>{
      let b="";r.on("data",c=>b+=c);r.on("end",()=>ok(`${p} -> ${r.statusCode} ${b.slice(0,80)}`));
    }));
    console.log(await get("/api"));
    console.log(await get("/api/health"));
    console.log(await get("/api/reservations/all"));
    console.log(await get("/docs"));
    s.close();process.exit(0);
  });'
```

**Expected**:

| Path | Status | Meaning |
|---|---|---|
| `/api` | 200 | application started |
| `/api/health` | 200, `database: "up"` | data store genuinely reachable |
| `/api/reservations/all` | 401 | default-deny survives the serverless path |
| `/docs` | **404** | documentation withdrawn when deployed (FR-002a) |

The `/docs` result is the one to watch: a 200 here means the environment gating is not
working.

---

## Scenario 3 — Health reports failure when the data store drops (US1, FR-016)

The important half of the health route, and the one with a caveat.

**Do not** test this by pointing a cold start at an unroutable host. Startup will simply
never finish — the database module retries indefinitely and no route is ever registered, so
you get a hung boot rather than a 503. That limitation is recorded in the spec's Known
Deviations and confirmed by measurement (still retrying after 40s).

What the route does cover is a connection that fails *after* startup, which is the case
that matters on a warm instance. The state mapping is pinned by unit tests instead, where
each connection state can be exercised directly:

```bash
NODE_ENV=local npx jest src/health
```

**Expected**: `connected` → `up`; `disconnected`, `connecting`, `disconnecting`,
`uninitialized` and any unrecognised value → `down`, and the controller answers **503** with
`{"status":"error","database":"down"}` rather than a 200 carrying a failure field.

The controller spec also asserts the failure body contains no host, credential, or driver
error text (FR-017).

---

## Scenario 4 — Transport protections are active (US2)

```bash
curl -sI http://localhost:3000/api | grep -iE 'x-content-type|x-frame|strict-transport|content-security|x-powered-by'
curl -sI -H "Origin: https://not-allowed.test" http://localhost:3000/api
curl -sI -H "Origin: https://example.test"     http://localhost:3000/api

# Sign-in limit is 5 per 60s, so attempts 6 and 7 must be refused:
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "%{http_code} " \
    -X POST http://localhost:3000/api/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"nobody@example.test","password":"wrong"}'
done; echo

# The docs page must load WITHOUT a CSP, or its inline script is blocked and it renders blank:
curl -sI http://localhost:3000/docs | grep -icE 'content-security-policy'   # expect 0
```

**Expected**: the four named headers present and `X-Powered-By` absent; access granted for
the listed origin and not for the unlisted one; the first five sign-in attempts answer 401
(wrong password, but counted) and attempts 6–7 answer 429; the docs page returns 200 with
**no** `Content-Security-Policy`.

The wrong-password detail is the point of the loop: if the guards are ordered the other way
round, all seven return 401 and the throttle never engages.

Note the limitation from [transport-security.md](./contracts/transport-security.md): the
throttle is per-instance. This scenario is valid locally, where there is one instance; it
does **not** prove a deployment-wide limit, because there isn't one.

---

## Scenario 5 — Startup fails fast on bad configuration (FR-010, SC-007)

```bash
# Missing required value when deployed
env -u CORS_ORIGINS NODE_ENV=production node dist/src/main.js
# Present but empty
CORS_ORIGINS="" NODE_ENV=production node dist/src/main.js
# Quoted, as a dashboard paste would produce
CORS_ORIGINS="'https://example.test'" NODE_ENV=production node dist/src/main.js
```

**Expected**: each fails immediately, naming `CORS_ORIGINS`. None starts and then fails
later on a request. The quoted case matters — the hosting dashboard does not strip quotes.

---

## Scenario 6 — Nothing but the API is exposed (US4, FR-003)

Against a **deployed** URL, not localhost:

```bash
for p in /src/main.ts /dist/src/main.js /package.json /vercel.json \
         /specs/002-fix-vercel-deploy/spec.md /docs /robots.txt; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' "$DEPLOY_URL$p")"
done
```

**Expected**: 404 for every path except `/robots.txt`, which returns 200. Any 200 elsewhere
means the output directory is publishing more than intended — the failure mode User Story 4
exists to catch.

---

## Deploying

1. Set environment values in the hosting project — **unquoted**. `CORS_ORIGINS` is newly
   required; without it a deployed build refuses to start.
2. Leave `DB_PORT` unset (`mongodb+srv` rejects a port).
3. Confirm the data store accepts the platform's dynamic egress addresses (Atlas Network
   Access `0.0.0.0/0`). No code change substitutes for this.
4. Push the branch; a non-production branch produces a preview deployment — verify there
   before promoting. **A preview behaves exactly like production** (FR-002b), so expect
   `/docs` to be absent there too and `CORS_ORIGINS` to be required. Verify previews from
   the command line; the allowlist governs browsers only, so `curl` needs no origin
   approved. If you do want to drive a preview from a browser, add that preview's origin to
   `CORS_ORIGINS` for the Preview environment — the platform scopes values per environment,
   so this needs no code change.
5. Run Scenario 6 against the deployed URL, then Scenario 2's expectations.

## Post-deploy checks

| Check | Pass condition |
|---|---|
| `/api/health` | 200, `database: "up"` within 30s of deploy completion (SC-002) |
| Deploy log | No runtime-version override warning, no version-change cache invalidation (SC-005) |
| Second deploy, unchanged dependencies | Reuses the build cache (SC-006) |
| Protected route, no credential | Refused (SC-003) |
| Scenario 6 sweep | Only `/robots.txt` returns 200 (SC-004) |

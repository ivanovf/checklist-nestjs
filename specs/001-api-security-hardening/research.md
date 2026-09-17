# Phase 0 Research: API Security Hardening

**Feature**: `001-api-security-hardening` | **Date**: 2026-09-07

All decisions below were resolved against the actual state of the repository, not against
assumptions. No `NEEDS CLARIFICATION` items remain.

---

## R1 — How to make authentication and authorization default-deny

**Decision**: Register two application-wide guards via `APP_GUARD` in `AppModule`, in order:
`JwtAuthGuard` (extends `AuthGuard('jwt')`, skips routes marked `@Public()`), then `RolesGuard`.
Add a `@Public()` decorator (`SetMetadata('isPublic', true)`) for the small set of genuinely
public routes.

**Rationale**: The defect this feature exists to fix is not that a guard is wrong — it is that
per-controller opt-in was applied inconsistently. `RolesGuard` is present on `locks`, `items`,
and `auth`, and absent on `reservations`, `users`, `config`, and `activity-type`. Auditing the
eight controllers once fixes today's gap but leaves the next controller to be added exposed by
default. Global registration inverts the failure mode: forgetting the decorator now denies access
rather than granting it. `APP_GUARD` providers execute in registration order, so authentication
resolves `request.user` before the role check reads it.

**Alternatives considered**:
- *Add `RolesGuard` to the four controllers missing it* — smallest diff, but preserves the opt-in
  model that already failed once. Rejected.
- *A single combined guard* — fewer moving parts, but conflates authentication and authorization
  failures, making it hard to return 401 vs 403 correctly. Rejected.

---

## R2 — Defects inside `RolesGuard` that must be fixed before global registration

**Decision**: Fix four defects in `src/auth/guards/roles.guard.ts` as part of R1.

1. Read metadata with `reflector.getAllAndOverride('roles', [getHandler(), getClass()])` instead of
   `reflector.get('roles', getHandler())`.
2. Guard against `request.user` being absent rather than dereferencing it.
3. Reject a role that is not a member of the `Role` enum instead of falling through.
4. Replace the `console.log` on denial with the framework logger, recording account, route, and
   timestamp (FR-006).

**Rationale**: Item 1 is not theoretical — `ActivityTypeController` declares `@Roles(Role.ADMIN)`
at the *class* level (`activity-type.controller.ts:22`), and the current handler-only lookup
returns `undefined` for every one of its five routes. Since the guard returns `true` when no roles
metadata is found, registering the guard globally without this fix would leave that entire
controller open to any authenticated account while appearing to be protected. Items 2 and 3 close
the same fail-open shape from different directions.

**Note on deny-by-default**: `RolesGuard` returning `true` for routes with no `@Roles` metadata is
retained deliberately — under R1, such a route has already passed authentication, and requiring
role metadata on every route is enforced instead by the authorization matrix contract and its
test, which is a clearer failure than a runtime denial.

**Alternatives considered**: rewriting the guard from scratch — rejected, the existing shape is
sound and a targeted diff is easier to review for a security change.

---

## R3 — Resolving the caller's *current* role (FR-005)

**Decision**: `JwtStrategy.validate` loads the account by id and returns identity plus the role
stored on the account, rather than passing the token payload through unchanged.

**Rationale**: FR-005 requires authorization to reflect the account's role at request time. Tokens
are signed with `expiresIn: '1d'` (`auth.module.ts`), and `JwtStrategy.validate` currently returns
the payload verbatim, so the role is whatever it was at sign-in. Demoting or removing an
administrator therefore has no effect for up to 24 hours. The lookup is `findById` — a primary-key
read on an indexed field — which fits inside the constitution's 300 ms read budget.

**Alternatives considered**:
- *Trust the token claim* — free, but leaves a 24-hour revocation window. Rejected; this is exactly
  the class of "looks protected, isn't" defect the feature targets.
- *Shorten token lifetime to minutes* — degrades usability for every user to mitigate a rare event,
  and still leaves a window. Rejected.
- *Maintain a token denylist* — solves revocation but adds a read anyway, plus new state to manage.
  Rejected as strictly more complex than reading the role.

---

## R4 — What to do with the unapplied `ApiKeyGuard` (FR-007, FR-010)

**Decision**: Keep the guard, remove the hardcoded literal, read the key from configuration
(`TANK_API_KEY`), compare in constant time, and apply it to `PATCH /api/config/:id`.

**Rationale**: `ApiKeyGuard` compares an `Auth` header against the literal `'mytoken'`
(`api-key.guard.ts:19`) and is applied to no route. Planning surfaced why: `ConfigController`'s
`@Patch(':id') updateAnalogLecure` carries no guard at all, and the git history records it being
made public deliberately. `TANK_API_KEY` already exists in `.env.local`. So this is not dead code
to delete — it is an unfinished control for a real device integration, and the route it belongs on
is currently the only unauthenticated write endpoint in the service. Wiring the two together
resolves both the embedded credential and the open write in one change.

**Alternatives considered**:
- *Delete the guard and leave the route public* — leaves an unauthenticated write to service
  configuration. Rejected.
- *Require a full account for the device* — more secure in principle, but the device integration
  cannot perform a sign-in flow, and rotating a shared key is adequate for a single-purpose sensor.
  Recorded as a deliberate acceptance.

---

## R5 — Where sign-in throttling state lives (FR-013, FR-016)

**Decision**: A dedicated `login_attempts` MongoDB collection keyed by account identifier, holding
the consecutive-failure count and a `lockedUntil` timestamp, with a TTL index that expires stale
documents automatically. Additionally register `@nestjs/throttler` with a coarse per-IP limit as
defence in depth.

**Rationale**: FR-016 requires throttling state to survive restarts and be shared across concurrent
instances. The service deploys to AWS Lambda and Vercel, where instances are short-lived and run in
parallel — the default in-memory throttler store would let an attacker reset their own counter by
simply waiting out a cold start, or spread attempts across instances. MongoDB is already a
dependency and is the only shared, durable store present. A TTL index removes the need for a
cleanup job, which matters because there is no scheduler in a serverless deployment.

The per-account lock is the primary control, per the spec's edge case about many users sharing one
apparent network address; the per-IP throttler is secondary and may remain in memory, since its
failure mode is only reduced coverage, not a bypass of the account lock.

**Alternatives considered**:
- *Counters on the `users` document* — one fewer collection, but mixes high-churn authentication
  writes into the account record and offers no TTL expiry. Rejected.
- *Redis* — the conventional choice and better suited to this access pattern, but adds a new piece
  of infrastructure to provision, pay for, and secure across three deployment targets, for a
  service with tens of accounts. Rejected as disproportionate.

---

## R6 — Making sign-in failures indistinguishable (FR-015)

**Decision**: In `AuthService.validateUser`, always perform a bcrypt comparison — against a
precomputed dummy hash when the account does not exist — and return one identical error for
"no such account" and "wrong password".

**Rationale**: The current implementation returns `UnauthorizedException` immediately when
`findByEmail` misses (`auth.service.ts:18`), and only reaches `bcrypt.compare` when the account
exists. bcrypt at cost factor 10 takes on the order of 100 ms, so the two paths differ by roughly
two orders of magnitude — enough to enumerate valid accounts remotely from response timing alone.
The message text is already identical; the timing is not. A dummy comparison equalises it.

**Alternatives considered**: adding a random delay — masks the signal statistically but does not
remove it, and slows every sign-in. Rejected.

---

## R7 — Startup configuration validation (FR-008, FR-009)

**Decision**: Supply a Joi `validationSchema` to `ConfigModule.forRoot` covering every required
value, with `SECRET` constrained to a minimum of 32 characters. Separately, convert
`DatabaseModule` and `JwtModule` to inject `ConfigService` rather than reading `process.env`
directly, and make `ConfigModule.forRoot` the first entry in `AppModule`'s imports.

**Rationale**: Two distinct problems. First, nothing validates configuration today, so a missing
`SECRET` yields a service that starts and fails opaquely later. Joi validation is the mechanism
`@nestjs/config` provides for fail-fast startup and gives the "name the offending value" behaviour
FR-008 requires. Second, and less obvious: `DatabaseModule`, `JwtModule`, and `JwtStrategy` all
read `process.env` at factory-execution time, while `ConfigModule.forRoot` — which is what loads
the `.env` file — is listed *fourth* in `AppModule`'s imports, after `DatabaseModule`. Relying on
module initialisation order for whether secrets are populated is fragile; injecting `ConfigService`
makes the dependency explicit and lets validation run before anything consumes a value.

**Alternatives considered**: `class-validator` on a config class — consistent with the DTO layer,
but Joi is the documented `@nestjs/config` path and expresses cross-field environment rules more
directly. Rejected on ecosystem fit, not capability.

---

## R8 — Protective response headers across three deployment targets (FR-019, FR-020)

**Decision**: Apply `helmet()` as global middleware in `main.ts`, and disable Express's
`x-powered-by`. Apply it inside the Nest application, not at any platform edge.

**Rationale**: The service deploys to AWS Lambda via `serverless-express`, to Vercel, and to Heroku.
Configuring headers at API Gateway or in `vercel.json` would protect one target and silently leave
the others bare. Helmet is Express middleware and `serverless-express` presents a standard Express
request, so a single in-application registration covers all three identically. `x-powered-by` is
Express's own disclosure header and is not removed by Helmet's defaults in all configurations, so
it is disabled explicitly.

**Alternatives considered**: hand-written header middleware — avoids a dependency but reimplements
a well-maintained default set. Rejected.

---

## R9 — Environment-scoped browser origin allowlist (FR-017, FR-018)

**Decision**: Replace the bare `app.enableCors()` (`main.ts:31`) with an explicit origin list read
from a `CORS_ORIGINS` configuration value. The Joi schema requires the value to be present and
non-empty whenever `NODE_ENV` is not `local`, so a deployed environment cannot start without one.

**Rationale**: `enableCors()` with no options approves every origin, which is what the service does
today. Binding the allowlist to configuration keeps it per-environment as FR-017 requires, and
folding the requirement into the startup schema is what makes FR-018 ("refuse to start rather than
default to open") actually enforceable — it reuses the R7 mechanism rather than adding a second one.

**Open input required**: the concrete origin values for each deployed environment are not derivable
from the repository. This is already recorded as a Dependency in the spec; it blocks release of a
deployed environment, not implementation.

---

## R10 — Uniform error shape and strict payload validation (FR-021, FR-022)

**Decision**: Register a global exception filter producing one error body shape for every failure,
mapping unrecognised exceptions to a generic 500 with no detail. Extend the existing global
`ValidationPipe` with `whitelist: true` and, in a second step, `forbidNonWhitelisted: true`.

**Rationale**: The current `ValidationPipe` (`main.ts:10`) sets only `transformOptions`, so unknown
payload properties are accepted and passed through to Mongoose. Without a filter, Mongoose
`CastError` and duplicate-key errors surface with driver detail intact. The two-step rollout of
`forbidNonWhitelisted` is deliberate: turning it on immediately would reject any existing client
that sends an extra field, and this feature must not change behaviour for legitimate users.
Enabling `whitelist` first strips unknown fields silently while logging what *would* have been
rejected, which turns a guess about client behaviour into an observation before the strict gate
goes on.

**Alternatives considered**: enabling both flags at once — simpler, but risks a user-visible
outage to fix a non-urgent hardening item. Rejected.

---

## R11 — Enforcing the gates in CI (FR-012, constitution Development Workflow)

**Decision**: Add `.github/workflows/ci.yml` running lint, unit tests, e2e tests, build,
`npm audit`, and a `gitleaks` secret scan on pull requests and pushes to `main`.

**Rationale**: The repository has no CI configuration at all, while the constitution requires the
five quality gates to be enforced by CI rather than by memory, and FR-012 requires the build to
fail when a credential literal is introduced. `origin` is a GitHub remote, so GitHub Actions is the
native fit. The secret scan is what keeps R4's fix from silently regressing.

**Alternatives considered**: a pre-commit hook — bypassable with `--no-verify` and not enforced for
any other contributor. Rejected as insufficient for a gate the constitution calls mandatory.

---

## R12 — Test strategy for the security controls (FR-023)

**Decision**: Drive US1 from a single table-driven end-to-end suite that enumerates every route in
`contracts/authorization-matrix.md` and asserts the response for an anonymous caller, a standard
authenticated caller, and an administrator. Run integration and e2e tests against
`mongodb-memory-server`. Each of the other four stories gets its own e2e suite.

**Rationale**: The constitution forbids mock-only coverage of persistence and auth flows, and FR-023
requires each control to have a test that fails if the control is removed. A table-driven matrix
test satisfies both while making the *absence* of a route from the contract detectable: the suite
asserts that the set of routes registered by the application equals the set in the matrix, so a new
unlisted endpoint fails the build rather than shipping unreviewed. `mongodb-memory-server` gives a
real MongoDB engine with no external service, which matters because the throttling design depends
on TTL-index behaviour that a mock would not reproduce.

**Alternatives considered**: per-controller guard unit tests with mocked contexts — faster, but they
verify the guard in isolation and would have passed cleanly against the current codebase, where the
guard works fine and is simply not registered. That is the exact defect they need to catch.

# Research: Password Recovery

**Feature**: `specs/012-password-recovery` | **Date**: 2026-10-01

## Observed behaviour (2026-10-01)

These were run or read before designing, because several of the spec's premises rest on them.

| # | What | How checked | Result |
|---|---|---|---|
| O1 | Sign-in throttling storage | Read `src/app.module.ts`, grepped `src` and `test` for a storage provider or `login_attempts` | `ThrottlerModule.forRoot` has **no `storage`**, so it uses the in-memory default. The Mongo-backed `login_attempts` lockout planned in 001 (R5) was never built: tasks T051 and T062 are unchecked. Throttle state is per serverless instance. `CLAUDE.md` says otherwise. |
| O2 | Session tokens carry an issue time | Ran `JwtService.sign` with the app's options and decoded the token | The payload has `iat` in **whole seconds** (`iat: 1790887100`) |
| O3 | bcrypt length limit | Ran `bcrypt.compare('a'×72 + 'EXTRA', hash('a'×72))` | `true`: bytes past 72 are silently ignored |
| O4 | `users.email` index | Read `src/users/entities/user.entity.ts` | None. `findByEmail` (sign-in) already filters on an unindexed field |
| O5 | Unknown fields in request bodies | `discrepancies.md` D5, observed 2026-09-28 | The global pipe accepts them (201) |
| O6 | Duplicate emails | `discrepancies.md` D13 (#18) | Accepted. Sign-in resolves the first match, so a later duplicate can never sign in |
| O7 | The session check reads the account | Read `src/auth/strategy/jwt-strategy.ts` | `validate()` already calls `UsersService.findById` on every authenticated request |
| O8 | `GET /api/login/validate` | Read `auth.controller.ts` | It is not `@Public`, so the global `JwtAuthGuard`, and with it the strategy, runs before its own `verifyAsync` |
| O9 | Global throttler guard | Read `app.module.ts` | `ThrottlerGuard` is **not** an `APP_GUARD`. Only routes that list it with `@UseGuards` are throttled |

## R1 — Where recovery lives

**Decision**: a `PasswordRecoveryController` and `PasswordRecoveryService` in `src/auth`, with
their own `PasswordRecovery` schema registered in `AuthModule`. Users are reached only through
`UsersService`, which `UsersModule` already exports.

**Rationale**: recovery is a credential flow, like sign-in. Keeping it under `src/auth` puts it
in the 90% coverage scope and under the security review the constitution requires for that
path. Principle II forbids importing the `User` model from another module, so the two user
operations recovery needs become `UsersService` methods (R7).

**Alternatives considered**: putting the issuing route on `UsersController`
(`POST /api/users/:id/recovery-code`). That reads well, but it makes `UsersModule` depend on
auth's recovery service and splits one flow across two modules.

## R2 — Routes, statuses and bodies

**Decision**:

| Route | Access | Success | Refusals |
|---|---|---|---|
| `POST /api/password-recovery/:userId/code` | admin | **201** `{ code, expiresAt }` | 400 (malformed id), 401, 403, 404 |
| `POST /api/password-recovery/complete` | public | **200** `{ passwordReset: true }` | 400, 429 |

Full shapes are in [contracts/password-recovery.md](contracts/password-recovery.md).

**Rationale**:
- Issuing creates a record, so it answers 201. Completing changes an existing password and
  creates nothing, so it answers 200 through `@HttpCode(200)`. The sign-in route's 201 is the
  existing precedent for POST, not a rule.
- An invalid code is refused with **400** and one fixed message, the same for every cause
  (FR-012). 401 was rejected: on a public route it would mean "no valid credentials", and
  the Flutter app is likely to treat any 401 as "session expired, sign out".
- `RefusalStatus` already allows 400, 401, 403, 404 and 429, so `ApiRefusals` needs no new
  status.

**Alternatives considered**: `PUT /api/users/:id/password` for completion. It needs the
account id, which a locked-out user doesn't know and shouldn't have to learn.

## R3 — Code generation and storage

**Decision**:
- **Generation**: `crypto.randomInt(0, 1_000_000)`, zero-padded to 6 digits.
- **Storage**: only `HMAC-SHA256(key, userId + ':' + code)`. The key is
  `HMAC-SHA256(SECRET, 'password-recovery-code-v1')`.
- **Comparison**: as part of the atomic database filter (R4). Nothing compares the code in
  application memory, so there is no timing side channel there.

**Rationale**:
- Six digits is only a million possibilities. A plain or bcrypt hash of a 6-digit code falls
  to an offline brute force in minutes once the database leaks, and bcrypt would be slow too.
  A keyed HMAC can't be brute-forced without the signing secret, which lives in the
  environment and not in the database.
- Binding the account id into the MAC stops a fingerprint copied from one account matching
  on another.
- Deriving the key from `SECRET`, which joi already requires to be at least 32 bytes, means
  no new environment variable. Rotating `SECRET` voids outstanding codes, which is harmless
  given the 1-hour lifetime.

**Alternatives considered**:
- bcrypt the code: rejected for the reason above.
- A new `RECOVERY_SECRET` variable: one more secret to provision and rotate, for no gain.
- A long random token instead of 6 digits: rejected in the spec, because the user types the
  code into a phone.

## R4 — State, atomicity and the attempt limit

**Decision**: one document per account, keyed by a **unique** `userId`. If the document
exists, a code is outstanding. Its states:
- **Issue**: upsert, replacing any earlier code and resetting `attempts` to 0. That is FR-007.
- **Complete**: one `findOneAndDelete({ userId, codeHash, expiresAt > now, attempts < 5 })`.
  - A match means success. The code is used up by the delete (FR-006), and concurrent
    completions race on a single atomic operation, so exactly one wins.
  - No match means
    `updateOne({ userId, expiresAt > now, attempts < 5 }, { $inc: { attempts: 1 } })`,
    followed by the generic refusal.
- **Voided**: from the 5th miss onward, `attempts < 5` no longer matches, so even the correct
  code is refused (FR-008). The document stays until it expires.
- **Expired**: refused by the `expiresAt > now` filter. A TTL index on `expiresAt` deletes the
  document. The TTL monitor runs about every 60 s, so expiry is enforced by the query and the
  index only cleans up.

**Rationale**: every state change is a single-document atomic operation, so there's nothing to
lock or run in a transaction. MongoDB is the shared store across instances, so the attempt
limit holds across serverless instances, which O1 shows the throttler does not. The TTL index
means no cleanup job, which suits serverless.

**Concurrent issuing**: two administrators issuing for one account at once both upsert on
the unique `userId`. MongoDB 4.2+ retries an upsert that hits a duplicate key when the filter
is an equality on that unique index, so both succeed and the last write wins. Only one code
then works. A task proves this rather than relying on the documentation.

**Alternatives considered**: keeping used and voided codes as history with flags. That gives
an audit trail, but the security log (FR-015) already provides one, and the extra states
complicate every query.

## R5 — Rate limiting (FR-009) and the false premise in the spec

**Decision**: `@UseGuards(ThrottlerGuard)` with `@Throttle({ default: { limit: 5, ttl: seconds(60) } })`
on the completion route, the same per-source limit as sign-in, listed before anything else that
can throw. The issuing route is admin-only and is not throttled.

**Finding**: FR-009 said the limit must hold "across serverless instances as sign-in
throttling already does". O1 shows sign-in throttling does **not** do that. The guessing bound
the spec relies on (SC-006: 5 guesses per issued code) comes from the attempt counter (R4),
which lives in MongoDB and **does** hold across instances. The per-source throttle is defence
in depth, the same role 001's R5 gave it. FR-009 has been corrected to say so. Building the
Mongo-backed throttler store is out of scope. It belongs to 001's unfinished US3 (T051 to T062).

## R6 — Ending earlier sessions (FR-013)

**Decision**:
- `User` gains `passwordChangedAt: Date`, which recovery sets.
- `JwtStrategy.validate` refuses a token when
  `passwordChangedAt && payload.iat < floor(passwordChangedAt / 1000)`.
- The field is `select: false`, and `UsersService.findById` opts back in with
  `.select('+passwordChangedAt')`.

**Rationale**:
- The strategy already reads the account on every request (O7), so there's no new lookup.
- The comparison is in whole seconds because `iat` is (O2). A token issued in the same second
  as the reset is accepted. Otherwise the user's own sign-in straight after a reset could be
  refused at random. The window this leaves for a pre-reset token is under one second, and is
  accepted.
- `select: false` keeps the field out of every user response, which are projected through
  `toJSON` (D3). That way no user route's contract changes and `openapi.json` only gains the
  two new operations.
- `GET /api/login/validate` is covered automatically, because the guard runs first (O8).

**Alternatives considered**:
- A per-account token version claim. It needs a new claim, and tokens already in circulation
  without it would need special handling.
- A server-side denylist. That's a new collection and a lookup on every request.

## R7 — `UsersService` changes

**Decision**:
- `resetPassword(id, plain)`: hashes with bcrypt and sets `password` and
  `passwordChangedAt = now` in one update. Returns whether the account still existed.
- `findById(id)`: also selects `passwordChangedAt`.
- `findByEmail` is reused unchanged for completion.

**Rationale**: completion has to find the account the same way sign-in does (spec edge case),
so it reuses the sign-in lookup. Hashing stays in `UsersService`, next to the other two places
that hash.

## R8 — Duplicate emails (D13)

**Decision**: there's no special handling. Completion resolves the email the way sign-in does,
taking the first match. A code issued for a later duplicate account, which can never sign in
(O6), is therefore always refused with the generic refusal. It fails closed and changes
nothing.

**Rationale**: recovering an account that can't sign in is pointless. Fixing D13 (#18) is its
own change. This feature mustn't widen it, and it doesn't.

## R9 — Input validation and unknown fields (D5)

**Decision**: both routes bind a DTO through a route-scoped
`ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`, the same pattern as 011's
route pipes. The completion DTO:
- `email`: non-empty string, max 254.
- `code`: exactly 6 digits, `/^\d{6}$/`.
- `newPassword`: string, at least 8 characters, at most **72 bytes**.

A failed validation is refused with 400 before any lookup, so no code is used up and no attempt
counted (FR-010).

**Rationale**:
- O5 shows the global pipe would accept extra fields. Principle IV requires refusing them,
  and the spec's edge case asks for it. Fixing the global pipe is D5 (#10) and out of scope.
- The spec's wording "consistent with every other route" was wrong (every other route accepts
  extra fields) and has been corrected.
- The 72-byte maximum follows from O3. A longer password would be stored truncated, and a
  different password sharing its first 72 bytes would then sign in. Refusing it is honest.
  This is a refusal the spec didn't name, and it's recorded in the contract.

## R10 — Security events and logging (FR-014, FR-015)

**Decision**: one structured `Logger` line per event, in the same JSON shape as
`RolesGuard.deny`:
- `password_recovery.issued` with `{ account: userId, issuedBy: adminId }`
- `password_recovery.completed` with `{ account: userId }`
- `password_recovery.refused` with `{ account: userId | 'unknown', reason }`

`reason` is one of `unknown_account`, `no_outstanding_code`, `wrong_code`, `attempts_exhausted`
or `account_gone`. It appears only in the log and never in the response. No line ever carries
the code, the password or the email.

**Rationale**: the operator needs to see abuse, such as a run of `wrong_code` refusals, but the
caller mustn't. Logging the id instead of the email meets FR-014.

**Residuals**, both accepted and noted for the security review:
- **Timing**: the unknown-email path skips the code queries, so it answers slightly faster
  than a known one. The difference is one indexed read, inside network jitter, and the
  per-source throttle limits how often it can be measured.
- **Code burning**: anyone who knows an account's email can spend its outstanding code's 5
  attempts, so the user needs a new code from an administrator. This is the price of the
  attempt limit (FR-008, US2-4). Spreading the attempts across instances doesn't help the
  attacker, because the counter is in MongoDB.
- **No correlation id**: the events carry none, because the codebase has no correlation-id
  mechanism (Principle V). It is an existing gap shared with `RolesGuard`.

## R11 — Index on `users.email` (Principle V)

**Decision**: add a **non-unique** index on `users.email`.

**Rationale**: completion filters on `email` through `findByEmail`. Principle V requires every
query filter field to be indexed, and sign-in already breaks that (O4), so this fixes an
existing violation in the code being touched. It must be non-unique because D13 means duplicate
emails may already exist in production. A unique index would fail to build. Making it unique is
D13's job.

## R12 — Response caching

**Decision**: the issuing response sets `Cache-Control: no-store`.

**Rationale**: it carries a live credential. Helmet doesn't set `no-store`. A response is the
only place the code ever appears (FR-002, FR-014), so no cache in between may keep it.

## R13 — Only recovery may write `passwordChangedAt` (found by `/speckit-analyze`, C1)

**Finding** (read 2026-10-01, not yet run, because this worktree has no `node_modules`):
- `UsersService.update` passes the whole request body into `$set`
  (`src/users/users.service.ts:55`).
- `create` builds the document from the whole body.
- The global pipe neither whitelists nor transforms (`src/bootstrap.ts:35`, D5).
- Mongoose's strict mode drops unknown fields, so extra fields are harmless today. But once
  `passwordChangedAt` is a schema path, `PUT /api/users/:id` with
  `"passwordChangedAt": "2099-01-01"` stores it.
- Every token for that account, including fresh sign-ins, would then have `iat` before 2099
  and be refused until someone edits the database: a permanent lock-out.

**Decision**: `create` and `update` drop `passwordChangedAt` from what they write.
`resetPassword` is the only writer. A regression e2e test proves both routes ignore it, and it
runs red as soon as the schema field exists.

**Rationale**: removing the one field at the two write paths closes the hole without changing
any route's contract or fixing D5 here. Fixing D5 globally would also close it, but that changes
every route's behaviour, and it is issue #10.

**Alternatives considered**:
- Mongoose `immutable: true`: blocks the legitimate writer too, unless every recovery update
  passes an override.
- Keeping the timestamp in a separate collection: the session check would need a second lookup
  on every request (O7).


## Update after integrating `main` (2026-10-02)

`main` gained specs/010-fix-unknown-fields (D5 resolved) and specs/009-fix-unprojected-records
(D3 and D17 resolved). Effects on this feature:

- **R9**: the global `RequestValidationPipe` now refuses undeclared body fields at every route.
  The completion route's own `ValidationPipe` duplicated that and was removed. The DTO's rules,
  including the 72-byte cap, run in the global pipe. `closeRequestBodies` now marks
  `CompleteRecoveryDto` closed (`additionalProperties: false`) in `openapi.json`.
- **R13**: the hole is now closed three ways. The request rules refuse `passwordChangedAt` (400),
  and `update` writes only an allowlist (D17). `create` still drops it on its own, because it
  builds the document from the whole body, which the rules pass on untouched. The R13 e2e test
  now expects 400 and checks nothing was stored.
- O5 and the "D5 open" statements above describe the code as it was when this was planned.


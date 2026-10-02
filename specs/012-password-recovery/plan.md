# Implementation Plan: Password Recovery

**Branch**: `012-password-recovery` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-password-recovery/spec.md`

## Summary

A locked-out user regains access with an administrator's help.
- **Issue**: an administrator issues a single-use, 6-digit recovery code for an account
  (`POST /api/password-recovery/:userId/code`). The service returns it once, with
  `Cache-Control: no-store`.
- **Complete**: the user submits their email, the code and a new password to a public route
  (`POST /api/password-recovery/complete`). That replaces the password and does not sign
  them in.
- **Sessions**: every session issued before the reset is then refused.

The approach ([research](research.md)):
1. One `PasswordRecovery` document per account, in a new collection owned by `AuthModule`. The
   code is stored only as a keyed HMAC derived from `SECRET` (R3). Every transition is a single
   atomic operation, guarded by `expiresAt` and `attempts < 5`. That gives single use, voiding
   on reissue, the attempt limit and expiry, and it holds across serverless instances (R4).
2. Code refusals are one generic 400. Per-source throttling of 5 a minute is defence in depth
   (R2, R5).
3. `User.passwordChangedAt` is `select: false`, and `JwtStrategy` refuses a token whose `iat`
   came before it (R6).
4. `UsersService` gains `resetPassword` and `findById` selects the new field. Cross-module access
   goes through the service (R7).
5. A non-unique index on `users.email` fixes the unindexed sign-in lookup (R11).

**Findings while planning**, which corrected the spec:
- Sign-in throttling is **in memory** per instance, not persisted in Mongo as `CLAUDE.md`
  claims. The Mongo-backed lockout from 001 (R5) was never built (research O1). FR-009 was
  reworded so the guessing bound rests on the persisted attempt counter instead.
- Unknown fields are accepted globally (D5), so "consistent with every other route" was wrong.
  These two routes refuse unknown fields with route-scoped pipes.
- bcrypt ignores bytes past 72 (run, O3), so new passwords are capped at 72 bytes (FR-010).
- SC-004 is narrowed to refusals caused by the account or the code.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) on Node 24.x

**Primary Dependencies**: NestJS 10, Mongoose 8, `@nestjs/jwt` and Passport, bcrypt,
`@nestjs/throttler`, class-validator, and Node `crypto` (`randomInt`, `createHmac`).
**No new dependency.**

**Storage**: MongoDB. A new `passwordrecoveries` collection with a unique `userId` index and a
TTL index on `expiresAt`. `users` gains `passwordChangedAt` (`select: false`) and a non-unique
`email` index.

**Testing**: Jest unit tests (`pnpm test`, 90% floor on `src/auth`). E2e with
`mongodb-memory-server`, `--runInBand`. The `test/docs` and `test/security` contract suites.

**Target Platform**: Vercel serverless (Node), plus a local `start:dev`

**Project Type**: web-service (REST API)

**Performance Goals**: Principle V write p95 < 500 ms. Completion costs one indexed user read,
one or two single-document atomic writes, and one bcrypt hash at cost 10 (about 70 ms).
Issuing costs one indexed read and one upsert. Every authenticated request reads one more
field on a lookup it already makes.

**Constraints**:
- No existing operation's contract changes. `openapi.json` gains only the two operations and
  their DTOs.
- The code never appears in logs, and appears in no response but the issuing one. Passwords
  and emails never appear in logs (FR-014).
- No new environment variable. Rotating `SECRET` voids outstanding codes, which is acceptable.
- The D5 global pipe, D13 duplicate emails and the Mongo throttler store are out of scope.

**Scale/Scope**: one new controller, service and schema, one request DTO and two response
DTOs, and changes to `UsersService`, `User`, `JwtStrategy` and `AuthModule`. Unit specs, one new e2e
suite, two matrix rows and the contract.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Test-first | ✅ | The e2e suite ([quickstart](quickstart.md)) is written first and seen failing (404 on unregistered routes, and old tokens still accepted). Unit tests cover every service branch: issue, success, unknown account, no code, wrong code, exhausted, expired, account gone. Also the controller's guard, throttle and pipe metadata, the `JwtStrategy` `iat` rule including the same-second boundary, and the schema indexes. `src/auth` stays at 90% or above. |
| II. Layering | ✅ | The controller only binds. `PasswordRecoveryService` is the only code touching `PasswordRecovery`, and it reaches users only through exported `UsersService` methods (R7). Responses go through DTOs. No `any`. |
| III. Secure by default | ⚠️ flagged | This **changes `src/auth/**` and adds an unauthenticated route that changes a password**, so explicit security review is required before merge. Reviewers should look at R3 (HMAC, not bcrypt, for a 6-digit code), R4 (atomic guards), R5 (in-memory throttle is only defence in depth), R6 (the sub-second same-second window), R10 (residuals: timing, code burning) and **R13**. `passwordChangedAt` would be client-writable through the existing user update and create routes (D5), which would let a client lock an account out of every session. Only recovery may write it, and a regression test proves it. No secrets in code or logs, no new secret. |
| IV. Validated, documented contracts | ✅ | DTO-bound bodies with `whitelist` and `forbidNonWhitelisted` (route scope, R9). The `:userId` path value is validated by `ParseObjectIdPipe` rather than a DTO. That is the convention every by-id route adopted in 008, and it is a literal gap against "every route parameter typed by a DTO", noted rather than fixed here. Each route has `@ApiTags('Auth')`, `@ApiOperation`, a typed success response and `@ApiRefusals` listing only observed statuses. `openapi.json` is regenerated in the same PR. Matrix rows 39 and 40 are added to `test/security/authorization-matrix.ts`, citing this feature's contract, as row 38 cites 002's. |
| V. Observability and performance | ✅ | Structured security events (R10). Every new query filter field is indexed (`userId`, with `expiresAt` and `attempts` on the same single document). The existing unindexed `email` lookup gains an index (R11). No list endpoint. Within budget. |
| Security standards | ✅ | Synthetic test data only. Tokens carry no new claims. The session check reuses the existing per-request lookup. |
| Workflow | ✅ | Feature branch, PR, `VERIFY_E2E=1 pnpm verify` with the e2e result stated, and III flagged in the PR description. |

**Result**: PASS, with one flagged item for the PR (III, the mandatory security review of an
`src/auth` change).

**Re-check after design**: PASS, unchanged. The design adds no dependency, no environment
variable and no new layer.

## Project Structure

### Documentation (this feature)

```text
specs/012-password-recovery/
├── spec.md
├── plan.md                     # this file
├── research.md                 # observed behaviour O1–O9, decisions R1–R12
├── data-model.md               # PasswordRecovery lifecycle; User changes; session rule
├── quickstart.md               # automated and manual validation
├── contracts/
│   └── password-recovery.md    # the two routes, statuses, bodies, examples
├── checklists/
│   └── requirements.md
└── tasks.md                    # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── auth/
│   ├── auth.module.ts                                # + MongooseModule.forFeature(PasswordRecovery), controller, service
│   ├── controllers/
│   │   ├── password-recovery.controller.ts           # NEW: issue (admin), complete (public, throttled, @HttpCode 200)
│   │   └── password-recovery.controller.spec.ts      # NEW: routing, roles, throttle order, pipes
│   ├── services/
│   │   ├── password-recovery.service.ts              # NEW: issue / complete; HMAC; atomic guards; security events
│   │   └── password-recovery.service.spec.ts         # NEW: every branch
│   ├── entities/
│   │   ├── password-recovery.entity.ts               # NEW: schema, unique userId, TTL expiresAt
│   │   └── password-recovery.entity.spec.ts          # NEW: asserts the indexes
│   ├── dto/
│   │   ├── complete-recovery.dto.ts                  # NEW: email, code /^\d{6}$/, newPassword 8 chars–72 bytes
│   │   ├── recovery-code-response.dto.ts             # NEW (docs only): { code, expiresAt }
│   │   └── password-reset-response.dto.ts            # NEW (docs only): { passwordReset: true }
│   └── strategy/
│       ├── jwt-strategy.ts                           # + iat vs passwordChangedAt; JwtPayload.iat
│       └── jwt-strategy.spec.ts                      # + before, same second, after, never recovered
└── users/
    ├── entities/user.entity.ts                       # + passwordChangedAt (select:false); email index
    ├── users.service.ts                              # + resetPassword(); findById selects passwordChangedAt; create/update drop it (R13)
    └── users.service.spec.ts                         # + resetPassword, findById projection

test/
├── auth/password-recovery.e2e-spec.ts               # NEW: the quickstart table
├── security/authorization-matrix.ts                 # rows 39, 40
└── docs/contract-sample.e2e-spec.ts                 # unchanged unless check 6 needs a new access level (it doesn't)

openapi.json                                          # regenerated: two operations and three DTOs
```

**Structure Decision**: this is the existing single-service layout. Recovery is a credential
flow, so it lives in `src/auth` beside sign-in. That puts it in the 90% coverage scope and
under the mandatory security review. The schema follows the `entities/` convention used by
`users`. `test/auth/` is a new e2e folder, because neither `security/` (cross-cutting guards)
nor `docs/` (contract checks) owns a feature flow.

## Implementation Order (for /speckit-tasks)

1. **Red, e2e**: write `test/auth/password-recovery.e2e-spec.ts` from the quickstart table, and
   add matrix rows 39 and 40. Check that they fail for the expected reasons: 404 on the routes,
   and an old token still accepted.
2. **Schema and users** (red, then green):
   - `PasswordRecovery` entity and its index spec.
   - `User.passwordChangedAt` and the email index.
   - `UsersService.resetPassword` and `findById`'s projection.
3. **Service** (red, then green): `PasswordRecoveryService.issue` and `.complete` with the
   R3/R4 guards and the R10 events.
4. **Controller and DTOs** (red, then green):
   - Route-scoped pipes.
   - The `ThrottlerGuard` with 5 per 60 s.
   - `@HttpCode(200)`.
   - `Cache-Control: no-store`.
   - The Swagger decorators.
   - Wiring in `AuthModule`.
5. **Sessions** (red, then green):
   - the R13 guard first, so only recovery writes `passwordChangedAt`, with its regression test;
   - then the `JwtStrategy` `iat` rule, unit tests at the same-second boundary, and the e2e US3
     tests.
6. **Green**: all unit and e2e suites, including the throttle, matrix and docs suites. Run the
   SC-008 log scan.
7. **Contract**:
   - Run `pnpm docs:export`. The diff must touch only the two operations and their schemas.
   - Run `pnpm docs:check`.
8. **Gates**: `pnpm install`, since the worktree has no `node_modules`, then
   `VERIFY_E2E=1 pnpm verify`. Open the PR with III flagged for security review, the R5
   finding stated, and the e2e result.

## Complexity Tracking

No violations to justify.

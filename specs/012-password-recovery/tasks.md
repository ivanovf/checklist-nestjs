---

description: "Task list for 012-password-recovery"
---

# Tasks: Password Recovery

**Input**: Design documents from `specs/012-password-recovery/`

**Prerequisites**: plan.md, spec.md, research.md (O1–O9, R1–R12), data-model.md,
contracts/password-recovery.md, quickstart.md

**Tests**: Required. Constitution Principle I is test-first and non-negotiable, and `src/auth`
has a 90% coverage floor. Every test task MUST be run and **seen failing for the reason
stated** before its implementation task begins.

**Organization**:
- **US1** (P1): issue a code, then complete with it. Single use, and reissuing voids the old
  code.
- **US2** (P1): abuse resistance.
  - Admin-only issuing.
  - Identical refusals.
  - Expiry and the attempt limit.
  - Throttling.
  - Strict body validation.
  - Security events.
- **US3** (P2): sessions issued before a recovery are refused.

⚠️ **Release note**: US1 alone is runnable and testable, but it must **not** ship without US2.
The spec says an unprotected public password-change route is worse than none. The smallest
releasable increment is therefore US1 + US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, US3

## Ground rules for every task

- Run commands through `zsh -ic '…'`. For one e2e file, use
  `pnpm test:e2e test/auth/password-recovery.e2e-spec.ts`. For one unit file, use
  `pnpm test src/auth/services/password-recovery.service.spec.ts`. **Never** use `--`: pnpm 12
  passes it through literally and jest then finds no tests.
- No `any`, and no non-null assertions. Match the surrounding style: block comments that
  explain *why*, the `createTestApp({ transport: true })` / `seedAccounts` / `tokenFor`
  helpers, and the chainable model stubs already used in the service specs.
- Test data MUST be synthetic. The in-memory mongod is shared by the whole e2e run (`--runInBand`).
- **Throttle in e2e**: completion allows 5 requests per 60 s per source, and every request
  in the suite comes from one source. Clear the in-memory throttle store in `beforeEach`, and
  between requests where one test needs more than 5:
  `(app.get(ThrottlerStorage) as ThrottlerStorageService).storage.clear()`. Both come from
  `@nestjs/throttler` 6.5.0, where `storage` is a public `Map` getter, checked on 2026-10-01.
  Only the throttle test itself (T025) keeps the store intact.
- The generic refusal message is exactly `The recovery code is invalid or has expired.` Define it
  once as an exported constant in the service, and import it in the tests.
- No existing route's documented contract may change.

---

## Phase 1: Setup

- [X] T001 Run `pnpm install` in this worktree (it has no `node_modules`). Then run `pnpm lint:ci`,
  `pnpm test` and `pnpm build` to record a green baseline in the Implementation notes at the end
  of this file. A baseline failure stops the feature until it's understood.
- [X] T002 Create `test/auth/password-recovery.e2e-spec.ts`, describe `'Password recovery (012)'`.
  - Header comment: cite the spec, the contract, and research R4/R5/R6.
  - `beforeAll`: `createTestApp({ transport: true })`, then `seedAccounts`. Keep `admin` and
    `guest` with their tokens.
  - `beforeEach`: clear the throttle store (see Ground rules) and delete every
    `PasswordRecovery` document. Reach the model as
    `app.get<Model<PasswordRecovery>>(getModelToken(PasswordRecovery.name))`. The import fails
    to compile until T005, which is expected.
  - Helpers:
    - `issue(userId, token = adminToken)` posts to `/api/password-recovery/${userId}/code`.
    - `complete(body)` posts to `/api/password-recovery/complete`.
    - `signIn(email, password)` posts to `/api/login`.
    - `freshGuest()` creates a new guest account per test via the user model, bcrypt-hashing
      `GUEST_PASSWORD`, so tests never share a password state.
  - Add `afterAll(() => app.close())`.

---

## Phase 2: Foundational (shared persistence, blocking all stories)

**⚠️ CRITICAL**: T003 and T004 must be run and seen failing before T005 and T006. T006 makes
`passwordChangedAt` a schema path, which opens the R13 hole. T007 and T008 must be seen failing
and T009 must close the hole **before any story starts**, so no commit on this branch ever has
the field writable by clients.

- [X] T003 [P] Create `src/auth/entities/password-recovery.entity.spec.ts`, mirroring
  `src/activity/entities/activity.entity.spec.ts`. Assert that `PasswordRecoverySchema.indexes()`
  contains:
  - `[{ userId: 1 }, { unique: true }]`
  - `[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]`

  Also assert that `userId`, `codeHash`, `issuedBy`, `issuedAt`, `expiresAt` and `attempts` are
  required paths, and that `attempts` defaults to 0. Cite data-model.md and Principle V.
  **Expect failure**: the module does not exist.
- [X] T004 [P] Create `src/users/entities/user.entity.spec.ts`. Assert that `UserSchema.indexes()`
  contains `[{ email: 1 }, {}]` (non-unique, research R11; it must **not** be unique because
  of D13). Also assert that `UserSchema.path('passwordChangedAt')` exists with
  `options.select === false`. **Expect failure**: no index and no path.
- [X] T005 Create `src/auth/entities/password-recovery.entity.ts`. It is a `@Schema({ collection: 'passwordrecoveries' })`
  class `PasswordRecovery extends Document` with:
  - `userId: Types.ObjectId`, required.
  - `codeHash: string`, required.
  - `issuedBy: Types.ObjectId`, required.
  - `issuedAt: Date`, required.
  - `expiresAt: Date`, required.
  - `attempts: number`, required, default 0.

  Declare `PasswordRecoverySchema.index({ userId: 1 }, { unique: true })` and
  `.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })`. Add comments:
  - one document per account; its existence means a code is outstanding;
  - the code itself is never stored, and only an HMAC is (R3);
  - expiry is enforced by queries, and TTL only cleans up (R4).

  T003 goes green.
- [X] T006 In `src/users/entities/user.entity.ts`, add `passwordChangedAt?: Date` as
  `@Prop({ type: Date, select: false })`. Comment it: it is set only by password recovery and
  is used to refuse earlier sessions (FR-013, R6). It is excluded by default so it never
  reaches a user response (D3). Add `UserSchema.index({ email: 1 })` with a comment citing
  R11, D13 (#18) and why it isn't unique. T004 goes green.
- [X] T007 [P] In `src/users/users.service.spec.ts`, add `describe('passwordChangedAt is never client-written (R13)')`:
  - (a) `update(id, { ...validUpdateBody, passwordChangedAt: new Date('2099-01-01') })` calls
    `findByIdAndUpdate` with a `$set` that has **no** `passwordChangedAt` key.
  - (b) `create({ ...validCreateBody, passwordChangedAt: new Date('2099-01-01') })` constructs
    the model from input without that key.

  Build the inputs with a cast through `unknown` to the DTO type, not `any`, because the DTOs
  don't declare the field. That's the point: the global pipe doesn't strip it (D5). **Expect
  failure**: the key is passed through.
- [X] T008 In `test/auth/password-recovery.e2e-spec.ts`, add `describe('R13: only recovery sets passwordChangedAt')`:
  - Create a fresh account and sign it in.
  - (a) The account updates itself with `PUT /api/users/<its id>` and a full valid body (D9
    requires every field) plus `passwordChangedAt: '2099-01-01T00:00:00.000Z'`. Then the stored
    account, read with `.select('+passwordChangedAt')`, has **no** `passwordChangedAt`, and
    `GET /api/login/validate` with its token → 200. (After integrating `main`, the request
    itself is refused with 400; see the note at the end.)
  - (b) As the shared admin, `POST /api/users` with a valid body plus the same field → 201,
    and the stored account has no `passwordChangedAt`.

  Header comment: cite research R13. Without this guard, once US3 lands a client could lock
  an account out of every session. **Expect failure**: the field is stored in both
  cases, because T006 made it a schema path.
- [X] T009 In `src/users/users.service.ts`:
  - Add a private `withoutRecoveryFields<T extends object>(input: T): Omit<T, 'passwordChangedAt'>`
    that copies the input without `passwordChangedAt`. Use destructuring, and the same
    `eslint-disable-next-line @typescript-eslint/no-unused-vars` comment style `skipPassword`
    uses.
  - Apply it in `create` (to the constructor input) and in `update` (to the `$set`).
  - Doc comment: only `resetPassword` may write the field (R13). The global pipe doesn't strip
    unknown fields (D5).

  T007 and T008 go green.
- [X] T010 Register the model in `src/auth/auth.module.ts`: add
  `MongooseModule.forFeature([{ name: PasswordRecovery.name, schema: PasswordRecoverySchema }])` to `imports`.
  Run `pnpm build`, then `pnpm test`: still green, with no other behaviour change.

**Checkpoint**: the persistence shape exists and its specs are green. Only recovery can write `passwordChangedAt` (R13). No route exists yet.

---

## Phase 3: User Story 1 - A locked-out user gets back in with an administrator's help (Priority: P1) 🎯 MVP

**Goal**: an admin issues a code, and the user completes with it and signs in with the new
password. A used code is refused, and a reissued code replaces the old one (FR-001 to FR-007,
FR-011).

**Independent Test**: the `US1` block of `test/auth/password-recovery.e2e-spec.ts` passes.

### Tests for User Story 1 ⚠️ write first, see them fail

- [X] T011 [P] [US1] In `test/auth/password-recovery.e2e-spec.ts`, add `describe('US1')`:
  - (a) admin issues for a fresh guest → **201**:
    - `code` matches `/^\d{6}$/`;
    - `new Date(expiresAt)` is 60 min ± 1 min from now;
    - header `cache-control` contains `no-store`;
    - exactly one `PasswordRecovery` document exists, for that `userId`;
    - its `codeHash` is not equal to, and does not contain, the code.
  - (b) complete with `{ email, code, newPassword: 'a new passphrase' }` → **200**, with a body
    deep-equal to `{ passwordReset: true }` and no `access_token` key (clarification Q2).
  - (c) after (b): signing in with the new password → 201, and with `GUEST_PASSWORD` → 401.
  - (d) after (b): the same completion again → **400** with the generic message. The document
    is gone.
  - (e) issue twice, then complete with the **first** code → 400 generic; the **second** code
    → 200 (FR-007, US2-5).
  - (f) admin issues for a non-existent valid id (`new Types.ObjectId()`) → **404** with
    `user #<id> not found`. Issuing for `not-an-id` → **400**.
  - (g) two **parallel** issues for one fresh guest (`Promise.all`) → both **201**. Exactly one
    `PasswordRecovery` document exists, and exactly one of the two returned codes completes
    (research R4, concurrent issuing). A 500 here means the upsert's duplicate-key retry
    didn't happen. Stop and record it rather than adding a retry blindly.

  **Expect failure**: 404 `Cannot POST` for every route.
- [X] T012 [P] [US1] In `src/users/users.service.spec.ts`, add `describe('resetPassword')`:
  - `resetPassword('id', 'plain')` calls `findByIdAndUpdate('id', { $set: { password: <bcrypt hash of 'plain'> } })`.
    Assert with `bcrypt.compare` on the captured argument; never compare against the plain value.
  - It resolves `true` when the model returns a document, and `false` when it returns `null`.

  US3 (T033, T034) extends the `$set`. **Expect failure**: the method does not exist.
- [X] T013 [P] [US1] Create `src/auth/services/password-recovery.service.spec.ts`. Stub
  `UsersService` (`findById`, `findByEmail`, `resetPassword`), `ConfigService.get('SECRET')` →
  `'s'.repeat(32)`, and the `PasswordRecovery` model (`updateOne`, `findOneAndDelete`, `findOneAndUpdate`, each
  returning `{ exec }`). Add `describe('issue')`:
  - (a) an unknown user (`findById` → null) → `NotFoundException` with `user #<id> not found`,
    and `updateOne` is not called.
  - (b) a known user:
    - `updateOne` is called with filter `{ userId }`;
    - the `$set` has `codeHash` (64 hex characters), `issuedBy`, `issuedAt`, `expiresAt` equal
      to `issuedAt + 3_600_000` and `attempts: 0`;
    - options are `{ upsert: true }`;
    - the result is `{ code, expiresAt }` with a 6-digit `code`.
  - (c) `jest.spyOn(crypto, 'randomInt').mockReturnValue(42)` gives `code === '000042'`, so
    leading zeros are kept.
  - (d) the same code for two different user ids gives different `codeHash` values, because the
    account is bound into the MAC (R3).

  Add `describe('complete')` (success path only here):
  - (e) `findByEmail` → user and `findOneAndDelete` → a document: `resetPassword(userId, newPassword)`
    is called, and the result is `{ passwordReset: true }`. The `findOneAndDelete` filter has
    `userId` and the same `codeHash` that `issue` produced for that code. US2 adds the
    `expiresAt` and `attempts` guards (T027).

  **Expect failure**: the module does not exist.
- [X] T014 [P] [US1] Create `src/auth/controllers/password-recovery.controller.spec.ts`, reading
  metadata with the helpers in `src/common/testing/route-metadata.ts`. Assert:
  - the controller path is `password-recovery`;
  - `issue` is `POST :userId/code`, has `@Roles(Role.ADMIN)`, and has a `Cache-Control: no-store`
    header (`__headers__` metadata);
  - `complete` is `POST complete`, is `@Public()`, and has `@HttpCode(200)`;
  - both delegate to the service with their bound arguments (`issue(userId, req.user.id)`,
    `complete(dto)`).

  **Expect failure**: the module does not exist.

### Implementation for User Story 1

- [X] T015 [US1] In `src/users/users.service.ts`, add `resetPassword(id: string, plain: string): Promise<boolean>`.
  - Hash with `SALT_ROUNDS`.
  - `findByIdAndUpdate(id, { $set: { password } }).exec()`.
  - Return whether a document came back.

  Doc comment: the only path that sets a password without the current one. Its caller must
  have proved control of the account (R7). T012 goes green.
- [X] T016 [P] [US1] Create the DTOs:
  - `src/auth/dto/complete-recovery.dto.ts`, with the US1 fields only:
    - `email`: `@IsString() @IsNotEmpty() @MaxLength(254)`;
    - `code`: `@IsString() @Matches(/^\d{6}$/)`;
    - `newPassword`: `@IsString() @MinLength(8)`.

    US2 adds the byte cap.
  - `src/auth/dto/recovery-code-response.dto.ts`: `code: string` with example `'042917'` and a
    description saying it is shown only once; `expiresAt: string` (date-time).
  - `src/auth/dto/password-reset-response.dto.ts`: `passwordReset: boolean` (example `true`).

  The two response DTOs are documentation only, like the existing `*-response.dto.ts` files.
- [X] T017 [US1] Create `src/auth/services/password-recovery.service.ts`.
  - Inject `UsersService`, `ConfigService` and the `PasswordRecovery` model.
  - Derive the HMAC key once in the constructor:
    `createHmac('sha256', SECRET).update('password-recovery-code-v1').digest()`.
  - `private fingerprint(userId, code)` returns the hex `HMAC-SHA256(key, ${userId}:${code})`.
  - `issue(userId, issuedBy)`:
    - `findById`, or throw `NotFoundException(`user #${userId} not found`)`;
    - `code = String(randomInt(0, 1_000_000)).padStart(6, '0')`;
    - upsert per T013(b);
    - return `{ code, expiresAt }`.
  - `complete({ email, code, newPassword })`:
    - `user = findByEmail(email)`; if none, throw `BadRequestException(RECOVERY_REFUSED)`;
    - `findOneAndDelete({ userId, codeHash })`; if none, throw the same. The expiry and attempt
      guards come in US2 (T028), so that T021 and T022 can be seen failing;
    - `resetPassword`; if it returns `false`, throw the same;
    - return `{ passwordReset: true }`.
  - Export `RECOVERY_REFUSED = 'The recovery code is invalid or has expired.'`.
  - Comments: why HMAC and not bcrypt (R3); why the comparison sits inside the atomic filter
    (R4, the race).

  T013 goes green.
- [X] T018 [US1] Create `src/auth/controllers/password-recovery.controller.ts`,
  `@ApiTags('Auth') @Controller('password-recovery')`.
  - `issue`:
    - decorators: `@Roles(Role.ADMIN) @Post(':userId/code') @Header('Cache-Control', 'no-store')
      @ApiBearerAuth() @ApiOperation({ summary: 'Issue a one-time password recovery code for an account' })
      @ApiCreatedResponse({ type: RecoveryCodeResponseDto })
      @ApiRefusals(400, 401, 403, 404)`;
    - parameters: `@Param('userId', ParseObjectIdPipe) userId` and `@Req() req`; the issuer is
      `(req.user as AuthenticatedUser).id`.
  - `complete`:
    - decorators: `@Public() @Post('complete') @HttpCode(200)
      @ApiOperation({ summary: 'Set a new password with a recovery code' })
      @ApiOkResponse({ type: PasswordResetResponseDto }) @ApiRefusals(400)`;
    - parameter: `@Body() dto: CompleteRecoveryDto`.

  Register the controller and `PasswordRecoveryService` in `src/auth/auth.module.ts`. T014 and
  T011 go green.
- [X] T019 [US1] Add matrix rows 39 and 40 to `test/security/authorization-matrix.ts`, per the
  contract, with the row-38-style comment citing `specs/012-password-recovery/contracts/password-recovery.md`.
  Run `test/security/authorization-matrix.e2e-spec.ts` and `test/docs/contract-completeness.e2e-spec.ts`.
  - Any failure about the refusals the matrix implies, or about completeness, is fixed in the
    controller decorators, not the tests.
  - The contract-file comparison (`docs:check`) is expected to fail until T036. Note it, and
    don't regenerate yet.

**Checkpoint**: US1 is green end to end. **Do not release**: US2 is still missing.

---

## Phase 4: User Story 2 - Recovery cannot be used to discover or take over accounts (Priority: P1)

**Goal**:
- Only admins issue.
- Every account or code refusal is identical.
- Codes expire after 1 h and die after 5 wrong tries.
- Completion is throttled.
- Bodies are strictly validated.
- Every outcome is logged without secrets.

Covers FR-008 to FR-010, FR-012, FR-014, FR-015, SC-003 to SC-006 and SC-008.

**Independent Test**: the `US2` block of the e2e suite passes, as does the service spec's
`complete` refusal block.

### Tests for User Story 2 ⚠️ write first, see them fail

- [X] T020 [US2] In the e2e file, add `describe('US2: who may issue')`:
  - (a) the guest token issues for itself → **403**, and no document exists.
  - (b) no token → **401**, and no document exists.

  These pass as soon as T018 exists (global guards). Record them as passing for the right
  reason, which is not the TDD failure, in the Implementation notes.
- [X] T021 [US2] Add `describe('US2: identical refusals (SC-004)')`. Collect the full
  `{ status, body }` for each of these:
  - (a) an unknown email `nobody@test.local`;
  - (b) a real account with no outstanding code;
  - (c) a wrong code;
  - (d) an expired code: issue, then `updateOne({ userId }, { $set: { expiresAt: new Date(Date.now() - 1000) } })`;
  - (e) a used code;
  - (f) a code whose account was deleted after issuing (delete the user document);
  - (g) a valid outstanding code submitted with the account's email **upper-cased**. Also
    assert that `POST /api/login` with the same upper-cased email and the right password is
    refused (401), so completion matches sign-in (spec edge case).

  Assert that all seven are `toEqual` the first one, and that it is
  `{ statusCode: 400, message: RECOVERY_REFUSED, error: 'Bad Request' }`.

  **Expect failure**: (d) is accepted (200), because the US1 service has no expiry guard yet.
  The others already refuse; record that they pass for the right reason.
- [X] T022 [US2] Add `describe('US2: attempt limit (FR-008)')`:
  - (a) issue; complete with 5 wrong codes (clear the throttle store between requests) → 400
    each. Then the **correct** code → 400 generic. The stored `attempts` is 5. The password is
    unchanged: sign in with `GUEST_PASSWORD` → 201.
  - (b) issue; 4 wrong codes; then the correct code → **200** (the boundary).
  - (c) issue; 5 wrong; issue again → the new code → **200** (a reissue resets the count).

  **Expect failure**: (a) the correct code still succeeds, because there is no attempt counter.
- [X] T023 [US2] Add `describe('US2: input validation (FR-010, R9)')`, using a valid
  outstanding code each time:
  - (a) `newPassword: 'short12'` (7) → 400 with a message naming `newPassword`.
  - (b) `newPassword` of 73 ASCII bytes → 400.
  - (c) `newPassword` of 25 `'é'` (50 bytes, 25 characters) → **200**, so the limit counts
    bytes, not characters.
  - (d) a `newPassword` of 37 `'é'` characters (74 bytes) → 400.
  - (e) the code `'12345'`, `'1234567'` or `'12a456'` → 400 naming `code`.
  - (f) an extra field `{ …valid, role: 'admin' }` → 400 naming `role`.
  - (g) a missing `email` → 400.
  - (h) `newPassword` equal to `GUEST_PASSWORD`, the current password → **200** (spec edge
    case: reuse is allowed).

  After each of (a), (b), (d), (e), (f) and (g), the stored `attempts` is still **0**, and a
  final valid completion → 200 (the code was not consumed).

  **Expect failure**: (b), (d) and (f) are accepted today, with no byte cap and no whitelist.
- [X] T024 [US2] Add `describe('US2: concurrent completion')`: issue, then `Promise.all` two
  identical valid completions → the statuses sorted are `[200, 400]`. Expect this to **pass**
  already, because `findOneAndDelete` is atomic (R4). Record that. In the same block, a
  completion sent **with** the admin's bearer token behaves exactly as an anonymous one
  (200 on a valid code), and the admin token still works afterwards (spec edge case).
- [X] T025 [US2] Add `describe('US2: throttling (FR-009)')` as the **last** block, with no
  store clearing inside it: 7 completions with wrong codes → the first 5 are 400 and the last
  2 are **429**. Mirror the comment in `test/security/auth-throttle.e2e-spec.ts` about counting
  failed attempts. **Expect failure**: 7 × 400.
- [X] T026 [US2] Add `describe('US2: no secrets in logs (FR-014, SC-008)')`:
  - Spy on `process.stdout.write` and `process.stderr.write` (passing through) for one full
    flow: issue, a wrong code, a validation failure, then a success.
  - Assert that no captured chunk contains the code, the new password, `GUEST_PASSWORD`, or
    the guest's email.
  - Assert that chunks contain `password_recovery.issued`, `password_recovery.refused` and
    `password_recovery.completed`, each with the account id.

  **Expect failure**: no events are logged.
- [X] T027 [P] [US2] In `password-recovery.service.spec.ts`, add `describe('complete refusals')`:
  - (a) an unknown email → `BadRequestException(RECOVERY_REFUSED)`, and neither model method is
    called.
  - (b) no match on `findOneAndDelete` → `findOneAndUpdate` with filter
    `{ userId, expiresAt: { $gt: Date }, attempts: { $lt: 5 } }`, update `{ $inc: { attempts: 1 } }`
    and `{ new: true }`, then the refusal.
  - (c) the `findOneAndDelete` filter also has `expiresAt: { $gt: <Date> }` and
    `attempts: { $lt: 5 }`.
  - (d) `resetPassword` → `false` (account gone) → the refusal.
  - (e) each path logs exactly one `warn` whose JSON has `event: 'password_recovery.refused'`
    and the `reason` from research R10 (`unknown_account`, `wrong_code`, `account_gone`). To
    tell `no_outstanding_code` and `attempts_exhausted` apart from `wrong_code`, the service
    reads the result of that `findOneAndUpdate`:
    - `null` → `no_outstanding_code` (none, expired or already voided);
    - the 5th miss (`attempts` after the increment is 5) → `attempts_exhausted`.
  - (f) `issue` logs an `info` (`log`) with `event: 'password_recovery.issued'`, `account` and
    `issuedBy`; a success logs `password_recovery.completed`.
  - (g) no logged string contains the code, the password or the email.

  **Expect failure**: no attempt filter, no `$inc` and no logging.

### Implementation for User Story 2

- [X] T028 [US2] In `src/auth/services/password-recovery.service.ts`:
  - Add `const MAX_ATTEMPTS = 5`, and add `expiresAt: { $gt: now }` and
    `attempts: { $lt: MAX_ATTEMPTS }` to the success filter. Comment: expiry is enforced here
    because the TTL monitor only runs about every 60 s (R4).
  - On a miss, call `findOneAndUpdate({ userId, expiresAt: { $gt: now }, attempts: { $lt: MAX_ATTEMPTS } }, { $inc: { attempts: 1 } }, { new: true })`.
    Its result chooses the logged reason:
    - `null` → `no_outstanding_code`;
    - `attempts === MAX_ATTEMPTS` → `attempts_exhausted`;
    - otherwise `wrong_code`.
  - Add a `private readonly logger = new Logger(PasswordRecoveryService.name)` and a
    `private event(level, name, fields)` that writes `JSON.stringify({ event, ...fields, timestamp })`.
    This is the same shape as `RolesGuard.deny`.
  - Log per T027(e) and (f). `account` is the user id string, or `'unknown'`. **Never** the
    email, code or password.

  T027, T021 and T022 go green.
- [X] T029 [P] [US2] In `src/auth/dto/complete-recovery.dto.ts`, add a `MaxBytes(72)` property
  decorator, defined in the same file with `ValidateBy` from class-validator. It checks
  `Buffer.byteLength(value, 'utf8') <= 72` and has the message
  `newPassword must be at most 72 bytes`. Comment it: bcrypt silently ignores bytes past 72
  (research O3, run 2026-10-01). Apply it to `newPassword`. Add a matching
  `@ApiProperty({ minLength: 8, description: '…at most 72 bytes (UTF-8)…' })` so the contract
  states it.
- [X] T030 [US2] In `src/auth/controllers/password-recovery.controller.ts`:
  - On `complete`, add `@UseGuards(ThrottlerGuard) @Throttle({ default: { limit: 5, ttl: seconds(60) } })`
    and `@ApiRefusals(400, 429)`.
  - Bind the body with
    `@Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })) dto`.
  - The issuing route has no body, but `ParseObjectIdPipe` is already route-scoped.
  - Comment: the throttle is defence in depth, per instance and in memory (research O1/R5). The
    guessing bound is the persisted attempt counter (FR-008).
  - Extend T014:
    - `complete` has `ThrottlerGuard` in its `__guards__`;
    - throttle metadata of limit 5 and ttl 60000;
    - a route pipe instance with `whitelist` and `forbidNonWhitelisted` set.

  T023, T025 and T014 go green.

**Checkpoint**: US1 + US2 green. This is the smallest releasable increment.

---

## Phase 5: User Story 3 - Sessions opened before the reset stop working (Priority: P2)

**Goal**: after a recovery, tokens issued before it are refused on every authenticated route,
and new tokens work (FR-013, SC-007).

**Independent Test**: the `US3` block of the e2e suite and the `JwtStrategy` spec pass.

### Tests for User Story 3 ⚠️ write first, see them fail

- [X] T031 [US3] In the e2e file, add `describe('US3: earlier sessions')`:
  - (a) a fresh guest signs in and gets token `old`. Wait until `Date.now()` crosses the next
    whole second (poll; don't sleep a fixed time) so `iat` is strictly earlier. Then issue and
    complete. Now `GET /api/login/validate` with `old` → **401**, and
    `GET /api/users/<guest id>` with `old` → **401**.
  - (b) sign in with the new password → the new token on the same two routes → **200**.
  - (c) a guest who has never been recovered keeps working (200), and the admin's token from
    `beforeAll` still works after a guest's recovery (200).

  **Expect failure**: (a) answers 200.
- [X] T032 [P] [US3] In `src/auth/strategy/jwt-strategy.spec.ts`, add `describe('sessions issued before a password recovery')`,
  with `findById` resolving an account that has `passwordChangedAt = new Date('2026-10-01T12:00:00.500Z')`:
  - (a) `iat` = that instant − 1 s, floored (`1790855999`) → `UnauthorizedException`.
  - (b) `iat` = the same whole second (`1790856000`) → accepted (R6, the same-second boundary).
  - (c) `iat` one second later → accepted.
  - (d) an account without `passwordChangedAt` and any `iat` → accepted.
  - (e) a payload without `iat` and an account **with** `passwordChangedAt` → refused (fail
    closed).

  Extend `JwtPayload` with `iat?: number` in the test inputs. **Expect failure**: (a) and (e)
  are accepted.
- [X] T033 [P] [US3] In `src/users/users.service.spec.ts`:
  - `findById` calls `.select('+passwordChangedAt')` (extend the stub chain);
  - `resetPassword`'s `$set` also has `passwordChangedAt` as a `Date` within 1 s of now.

  **Expect failure**: neither happens.

### Implementation for User Story 3

- [X] T034 [US3] In `src/users/users.service.ts`:
  - `findById` becomes `this.userModel.findById(id).select('+passwordChangedAt').exec()`.
    Update its comment: it now also feeds the earlier-session check.
  - `resetPassword` sets `passwordChangedAt: new Date()` in the same `$set`. Comment: it is set
    in the same atomic update as the password, so there's no window where the new password
    works but old sessions do too.

  T033 goes green.
- [X] T035 [US3] In `src/auth/strategy/jwt-strategy.ts`:
  - Add `iat?: number` to `JwtPayload`.
  - In `validate`, after the account check: if `account.passwordChangedAt` is set and
    `!(typeof payload.iat === 'number' && payload.iat >= Math.floor(account.passwordChangedAt.getTime() / 1000))`,
    throw `UnauthorizedException()`.
  - Comment: `iat` is in whole seconds (research O2), so the same second is accepted, or a
    sign-in right after a reset could be refused at random. A missing `iat` fails closed. The
    lookup already happens on every request (O7).

  T032 and T031 go green. Then rerun the whole e2e suite, since every authenticated route now
  passes through this check.

**Checkpoint**: all three stories green.

---

## Phase 6: Polish & cross-cutting

- [X] T036 Run `pnpm docs:export`, then `git diff --stat openapi.json` and read the diff. It
  must add exactly:
  - the two operations;
  - `CompleteRecoveryDto`, `RecoveryCodeResponseDto` and `PasswordResetResponseDto`.

  It must change **no** existing operation or schema. In particular, the `User` schemas must
  not gain `passwordChangedAt`. Then run `pnpm docs:check` → clean. If check 6 in
  `test/docs/contract-sample.e2e-spec.ts` needs a sample per access level, confirm the
  existing samples already cover admin and public, and add nothing unless it fails.
- [X] T037 [P] Run `pnpm test --coverage`. `src/auth/**` must be at least 90% lines and the
  overall figure at least 80%. Add unit cases for any uncovered branch in
  `password-recovery.service.ts` or `jwt-strategy.ts` rather than lowering anything.
- [X] T038 [P] Run `pnpm lint:ci`. Fix the findings in the source; don't disable rules inline.
- [X] T039 Run the quickstart's manual section locally with `pnpm db:setup && pnpm start:dev`:
  issue, complete, repeat, then sign in. Confirm the server log lines name only account ids.
  Record the outcome in the Implementation notes.
- [X] T040 Run `pnpm test:e2e` (the whole suite, about 3 minutes or more on `/mnt/c`) and
  confirm that every pre-existing suite is unchanged and green. Pay particular attention to:
  - `auth-throttle`: the new throttled route has its own counter;
  - `authorization-matrix`: rows 39 and 40;
  - `record-ids`: no route was added under `users/:id`.
- [X] T041 Commit on `012-password-recovery` (never `main`). Use imperative summaries, no
  prefix, and bodies that explain why. Then run `VERIFY_E2E=1 pnpm verify` on the committed,
  clean HEAD.
- [ ] T042 Open the PR. The description must include:
  - the principles touched, with **III flagged**: a change to `src/auth/**` and a new public
    route that changes a password, so explicit security review is required. Point reviewers at
    research R3, R4, R5, R6, R10 (residuals, including no correlation id) and **R13**;
  - the R5 finding: sign-in throttling is in memory, contrary to `CLAUDE.md`, and 001's US3 is
    unbuilt;
  - the 72-byte refusal (R9);
  - the e2e result;
  - that `openapi.json` gains only the two operations.

  Don't open new issues, and don't edit `CLAUDE.md`, without the owner's approval.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001–T002)** → **Foundational (T003–T010)** → the stories.
- **US1 (T011–T019)** depends on Foundational.
- **US2 (T020–T030)** depends on US1. It hardens the same service, controller and DTO, so it
  can't run in parallel with US1.
- **US3 (T031–T035)** depends on Foundational and on US1's `resetPassword` (T015). It is
  independent of US2 and can run alongside it, since it touches different files apart from
  `users.service.ts`.
- **Polish (T036–T042)** depends on every story being included in the release.

### Within each phase

- Tests are written and **seen failing** before their implementation task.
- Entity, then users service, then recovery service, then controller.
- Each phase ends with its checkpoint suite green.

### Parallel opportunities

- T003 ∥ T004 (different spec files). T007 ∥ T005 (different files); T008 waits for T006.
- T011 ∥ T012 ∥ T013 ∥ T014 (four different files). T016 ∥ T015.
- T020–T026 all extend the same e2e file, so they run in order. T027 ∥ that sequence.
- T029 ∥ T028 (DTO vs service).
- US3's T032 ∥ T033. T031 edits the e2e file, so it waits for any open US2 e2e task. Phase 5
  as a whole can otherwise run alongside Phase 4 once US1 is done.
- T037 ∥ T038.

---

## Parallel Example: User Story 1

```text
Task: "T011 US1 e2e block in test/auth/password-recovery.e2e-spec.ts"
Task: "T012 resetPassword unit tests in src/users/users.service.spec.ts"
Task: "T013 PasswordRecoveryService unit tests in src/auth/services/password-recovery.service.spec.ts"
Task: "T014 controller metadata tests in src/auth/controllers/password-recovery.controller.spec.ts"
```

## Parallel Example: User Story 3 (alongside US2)

```text
Task: "T031 US3 e2e block in test/auth/password-recovery.e2e-spec.ts"
Task: "T032 iat rule tests in src/auth/strategy/jwt-strategy.spec.ts"
Task: "T033 findById / resetPassword tests in src/users/users.service.spec.ts"
```

---

## Implementation Strategy

### Smallest releasable increment: US1 + US2

1. Setup and Foundational.
2. US1: green, but **not releasable on its own**.
3. US2: the route can now be safely exposed.
4. **Stop and validate**: run the e2e suite, then the quickstart manual run.

### Then US3

5. US3 turns a reset into an effective lock-out of whoever knew the old password.
6. Polish, gates and the PR with the security review flagged.

---

## Implementation notes

Recorded during `/speckit-implement`, 2026-10-02.

**Baseline (T001)**: `pnpm install` OK (pnpm 12.5.1, Node 24.21.0). `lint:ci` clean, 34 unit
suites / 285 tests pass (255 s), `build` OK.

**Deviations from the task text**
- **T010 before T008**: the e2e suite's `beforeAll` resolves the `PasswordRecovery` model, so
  the suite could not boot until the model was registered. T008's first run failed on that,
  not on R13. The model was registered first, then T008 rerun to see the real failure.
- **U1 (analysis)**: `pnpm docs:export` was run at T019, not only at T036, because
  `test/docs/` reads the committed `openapi.json`. It was rerun after US2.
- **L3 (analysis)**: T030's controller-spec extension was written and seen failing before the
  controller change, not in the same step.
- **HMAC key as hex**: TypeScript 5.9 with the installed `@types/node` rejects a `Buffer`
  (and `createSecretKey(Buffer)`) as an HMAC key. The derived key is kept as its hex string,
  which is a valid key of the same strength (R3 unchanged in substance).
- **Contract check 4**: `test/docs/contract-completeness.e2e-spec.ts` allowed 429 only on
  sign-in. The completion route really returns 429 (proved by the throttling test), so it was
  added to that allowance, with a citation. No other test was changed to pass.
- **T026 logging**: Nest's testing module installs a logger that prints errors only, so
  `log` and `warn` never reach stdout in e2e. The test captures the logger calls as well as
  the streams.

**Seen failing, and why**
| Task | Failure observed | Expected? |
|---|---|---|
| T003/T004 | module missing; no `email` index, no `passwordChangedAt` path | yes |
| T007 | `passwordChangedAt` passed through to `$set` and the constructor | yes |
| T008 | **`passwordChangedAt: 2099-01-01` was stored** through `PUT /api/users/:id` and through admin `POST /api/users`: analysis C1 confirmed by running | yes |
| T011 | 404 `Cannot POST` on every recovery route | yes |
| T012–T014 | `resetPassword`, service and controller missing (compile errors) | yes |
| T020 | guest 403 passed at once (global guards). The anonymous case first failed **because of a test bug**: `undefined` triggered the helper's default token. Fixed to `null`, then 401 | partly |
| T021 | (d) expired code accepted with 200 (no expiry guard yet); the other six already refused | yes |
| T022 | (a) the right code succeeded after 5 wrong ones; (b), (c) passed early (no counter yet) | yes |
| T023 | 73-byte and 74-byte passwords and the unknown `role` field accepted | yes |
| T024 | passed at once: `findOneAndDelete` is atomic (R4) | expected early pass |
| T025 | 7 × 400, no 429 | yes |
| T026 | no events logged | yes |
| T027 | 8 of 14 failed (no guards, no `$inc`, no events); "never logs secrets" passed trivially | yes |
| T030 spec | no `ThrottlerGuard`, no throttle metadata, no route pipe | yes |
| T031 | old token answered 200 after recovery | yes |
| T032/T033 | `iat` not on `JwtPayload` (compile); no `select`, no timestamp | yes |

**Concurrent issuing (T011 g)**: both parallel issues answered 201 with one document stored,
so MongoDB retried the duplicate-key upsert as research R4 expected.

**Gates and validation**
- **T036**: `pnpm docs:export` then `docs:check` → "openapi.json is up to date". The diff is
  185 lines added and 0 removed: the two operations plus `CompleteRecoveryDto`,
  `RecoveryCodeResponseDto` and `PasswordResetResponseDto`. `passwordChangedAt` appears
  nowhere in it.
- **T037**: `pnpm test --coverage`: 38 suites, 330 tests pass. All files 91.65% lines;
  `src/auth/services`, `strategy`, `controllers` and `entities` at 100% lines. `src/auth/dto`
  was 90.9% because the byte-limit validator ran only in e2e, so
  `src/auth/dto/complete-recovery.dto.spec.ts` was added (12 tests, byte boundaries at 72).
- **T038**: `pnpm lint:ci` clean after `prettier --write` on the touched files (formatting
  only).
- **T039**: run against a **throwaway** `mongo:7` container on port 27018, with `.env.local`
  generated from `env.example` (ports changed). It was not run against the existing
  `checklist-mongo` container, which belongs to another worktree's dev data. Observed: issue
  201 with `Cache-Control: no-store`; complete 200; repeat 400 with the generic message; old
  password 401, new password 201; **the guest's pre-reset token 401**, the admin's token 200.
  The log had `password_recovery.issued`, `.completed` and `.refused` (`no_outstanding_code`),
  each naming account ids only. The code, both passwords and the email each appeared 0 times
  in the log. The container, the app and `.env.local` were removed afterwards.
- **T040**: full `pnpm test:e2e`: 13 suites, **640 tests pass**, including `auth-throttle`,
  `authorization-matrix` (rows 39, 40) and `record-ids`.
- **T041**: committed as `9698765` (spec artifacts) and `082a698` (implementation) on
  `012-password-recovery`. `VERIFY_E2E=1 pnpm verify` on `082a698`: **all gates passed**.
  - lint clean;
  - 39 suites and 342 unit tests, with 91.85% line coverage overall;
  - build OK and `openapi.json is up to date`;
  - `pnpm audit --audit-level high` passes: it reports 15 advisories, none high or critical;
  - **e2e: 13 suites, 640 tests pass**.

**Integrating `main` (2026-10-02)**: `main` gained 010 (D5) and 009 (D3, D17). There were text
conflicts in `src/users/users.service.ts` and its spec. Both sides were kept: `main`'s
allowlisted `update` and projected answers, plus this feature's `resetPassword`,
`findById` projection and `create` guard. Semantic follow-ups:
- the redundant route `ValidationPipe` on completion was removed, along with its unit test;
- `CompleteRecoveryDto` was added to the closed-body list in contract completeness;
- the R13 e2e test now expects 400;
- `openapi.json` was regenerated, because the auto-merged copy lacked `additionalProperties: false`
  on `CompleteRecoveryDto`.

See research "Update after integrating main".


---

description: "Task list for 010-fix-unknown-fields"
---

# Tasks: Refuse Unknown Fields in Requests

**Input**: Design documents from `specs/010-fix-unknown-fields/`

**Prerequisites**: plan.md, spec.md (clarified 2026-10-01), research.md (R1–R10), data-model.md,
contracts/request-rules.md, quickstart.md

**Tests**: Required. Constitution Principle I is test-first and non-negotiable, and a bug fix
needs a regression test that fails first. Every test task MUST be run and **seen failing for
the reason stated** before its implementation task starts. Tests marked "green before and
after" pin today's behaviour and must never go red.

**Organization**:

- **Foundational**: the request rules (`RequestValidationPipe`, `OwnIdInterceptor`,
  `applyRequestRules`). Every story depends on them.
- **US1** (P1, #10): undeclared body fields and query parameters are refused, a record's own
  `_id` is accepted on changes, checklist item `_id`s are kept, and the contract is closed.
- **US2** (P2, #10): the device's tank-level report.
- **US3** (P2, #20, D15): `userLock` is declared, and `lockUser` is removed.

**Ship as one PR.** Once Foundational is in, the app's reservation saves are refused until
US1's `ReservationItemDto` (item `_id`s) and US3's `userLock` land. T008's "app payload" cases
track that.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, US3

## Ground rules for every task

- Run commands through `zsh -ic '…'`.
  - One unit spec: `pnpm exec jest <path>`.
  - One e2e file: `pnpm test:e2e -- <path>` (about 2 minutes on `/mnt/c`; the first jest run
    can take over 5, so run long commands in the background).
  - pnpm 12: don't use `-s`.
- No `any`. Match the surrounding style:
  - block comments explaining *why*, citing `specs/010-fix-unknown-fields` and the research item;
  - `createTestApp({ transport: true })`, `seedAccounts`, `tokenFor`;
  - plain specs that use class-transformer start with `import 'reflect-metadata';`.
- Test data MUST be synthetic. The e2e mongod is shared, so seed through the API or the models.
- **Never loosen a rule to make an old test pass.** An existing test that sends an undeclared
  field or parameter is a test bug. Fix the test and list it for the PR.
- Out of scope, don't touch:
  - D3 (projection, spec 009), D6, D8, D9, D10;
  - sign-in (`POST /api/login`);
  - linking a reservation to the lock record by id;
  - the app's inability to clear a lock.
- **Valid bodies** (from `test/records/record-ids.e2e-spec.ts`):
  - items `{ label: 'l', status: true, description: 'd', category: 'c' }`
  - locks `{ lock: '1', userNumber: '2' }`
  - users POST `{ email, password: 'pw', name: 'n', role: 'authenticated' }`; users PUT adds
    `changePassword: false, currentPassword: 'x'`
  - reservations `{ dateIni, dateEnd, type: 'direct', validated: false, contact: 'c', quantity: 1 }`
    (a distinct date pair per create, because `checkAvailability` refuses identical pairs)
  - config `{ doorLock: '1', mainLock: '2', usersLimit: 3, analogLecture: 0 }`
  - activity `{ type: <existing activity-type _id>, status: 'TODO', price: 1, date: '2026-01-01', description: 'd' }`
  - activity-type `{ name: 'n', budget: 1 }`
  - device `{ analogLecture: 1, apiKey: process.env.TANK_API_KEY, time: 1 }`

  Every POST needs the admin token.
- **The app's payload shapes** (from `flutter/reservations/lib/**/models/*.dart`, `toJson`). On
  edits the app sends `_id` equal to the path id:
  - reservations `{ _id, dateIni, dateEnd, contact, quantity, cost, type, validated, userLock?, items: [{ _id, label, description, checked, comments, category, status }] }`
  - locks `{ _id, userNumber, lock }`
  - activity `{ _id, type, date, price, description, status }`
  - activity-type `{ _id, name, description, budget }`
  - users PUT: no `_id`

---

## Phase 1: Setup

- [X] T001 Confirm the branch with `git branch --show-current` (it must be
  `010-fix-unknown-fields`), and keep the two untracked `WhatsApp Image *.jpeg` files out of
  every commit. Run `pnpm exec jest src/common` and
  `pnpm test:e2e -- test/docs/contract-discrepancies.e2e-spec.ts` for a green baseline, and
  note the e2e run time.

---

## Phase 2: Foundational: request rules (blocks every story)

**Purpose**: strict bodies and queries with the value passed on as sent, and a record's own
`_id` allowed on changes (research R2, R3, R4, R8).

- [X] T002 [P] Write `src/common/pipes/request-validation.pipe.spec.ts`. Call
  `new RequestValidationPipe().transform(value, metadata)` with real DTOs.

  **Bodies** (`{ type: 'body', metatype, data: '' }`):
  - (a) `CreateItemDto` plus `notAField` → `BadRequestException` whose response `message`
    contains `property notAField should not exist`.
  - (b) `UpdateReservationDto` whose `items[0]` has `y: 1` → `items.0.property y should not exist`.
  - (c) `UpdateUserDto` (IntersectionType) plus `x` → refused.
  - (d) `createdAt`, `updatedAt`, `__v` and `_id` on `CreateItemDto` → each refused.
  - (e) **passed on as sent**: `UpdateItemDto` `{ label: 'x' }` resolves deep-equal to
    `{ label: 'x' }`, with no `checked` and no `comments` (the R2 regression).
  - (f) `CreateItemDto` with `status: 'false'` resolves with the string `'false'`.
  - (g) an undeclared field plus an invalid declared field → one exception listing both.

  **Queries** (`{ type: 'query', metatype, data: '' }`):
  - (h) `FilterReservationsDto` `{ limit: '5', foo: '1' }` → `property foo should not exist`.
  - (i) `FilterActivityDto` `{ price: '3', status: 'TODO' }` resolves to the same object, with
    `price` still `'3'`.
  - (j) `PaginationQueryDto` `{}` resolves to `{}` (defaults stay with the route pipe).

  **Params**:
  - (k) `{ type: 'param', metatype: String }` with `'abc'` → `'abc'`.

  Add a comment on the nested rule (`@ValidateNested` + `@Type`). **See it fail**: the module
  doesn't exist.
- [X] T003 [P] Write `src/common/interceptors/own-id.interceptor.spec.ts`. Build an
  `ExecutionContext` stub with `switchToHttp().getRequest()` returning
  `{ params, body }` and a `CallHandler` whose `handle` returns `of('ok')`.
  - (a) `params.id = ID` and `body = { _id: ID, label: 'x' }` → `handle` is called, and `body`
    becomes `{ label: 'x' }`.
  - (b) `body._id` different → throws `BadRequestException` with message
    `['_id must match the id in the path']`, and `handle` isn't called.
  - (c) no `params.id` (a create) with `body._id` → the body is untouched and `handle` is
    called (the pipe refuses it later).
  - (d) no `_id` in the body → untouched.
  - (e) the body isn't an object (`undefined`, an array) → untouched.

  **See it fail.**
- [X] T004 Create `src/common/pipes/request-validation.pipe.ts`: an `@Injectable()`
  `RequestValidationPipe implements PipeTransform`, composing two private `ValidationPipe`s.
  - `strictPipe`: `{ whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }`
  - `argumentPipe`: `{ transformOptions: { enableImplicitConversion: true } }`, exactly today's
    configuration.
  - `transform`: for `metadata.type === 'body' || 'query'`, await
    `strictPipe.transform(value, metadata)` and **return the original `value`**. Otherwise
    return `argumentPipe.transform(value, metadata)`.

  The class comment must cover R2's two observed regressions, why returning the original is
  safe, and why route query pipes still apply defaults. T002 goes green.
- [X] T005 Create `src/common/interceptors/own-id.interceptor.ts`: an `@Injectable()`
  `OwnIdInterceptor implements NestInterceptor`, written exactly as R4 and T003 describe. Read
  `req.params.id` and `req.body` from `context.switchToHttp().getRequest<Request>()`. Type the
  body as `Record<string, unknown>` behind a plain-object guard. The comment must explain:
  - interceptors run after guards and before pipes, so 401/403 come first and the pipe never
    sees a matching `_id`;
  - the mobile app sends its own `_id` on every edit (R4, clarification);
  - a create has no `:id`, so `_id` falls through to the pipe and is refused.

  T003 goes green.
- [X] T006 In `src/bootstrap.ts`, export `applyRequestRules(app: INestApplication): void`,
  which calls `app.useGlobalPipes(new RequestValidationPipe())` and
  `app.useGlobalInterceptors(new OwnIdInterceptor())`. Call it from `configureApp` in place of
  the inline `useGlobalPipes(new ValidationPipe(...))`. Remove the unused `ValidationPipe`
  import, and add a comment pointing to R3/R4.
- [X] T007 In `test/security/app-factory.ts`, replace the non-`transport` branch's own
  `app.useGlobalPipes(new ValidationPipe(...))` with `applyRequestRules(app)` (R8). Drop the
  unused import.

**Checkpoint**: the rules are live. Run T008 and T014 next (written in the story phases), and
the whole e2e suite in T013.

---

## Phase 3: User Story 1 - A request with an undeclared field is refused (Priority: P1) 🎯 MVP

**Goal**:
- The 14 create and change operations refuse undeclared body fields, at every depth.
- Creates refuse `_id`. Changes accept only the record's own `_id`.
- `createdAt`, `updatedAt` and `__v` are refused everywhere.
- Lists with declared parameters refuse unknown ones.
- The app's real payloads keep working, and the contract says all this.

**Independent Test**: `pnpm test:e2e -- test/records/unknown-fields.e2e-spec.ts`.

### Tests for User Story 1 ⚠️ Write T008–T010 before T004–T007 and see them fail on today's code

- [X] T008 [P] [US1] Create `test/records/unknown-fields.e2e-spec.ts`:
  - `describe('Undeclared request fields (010)')`, with a header citing
    specs/010-fix-unknown-fields, #10 and D5.
  - `beforeAll`: `createTestApp({ transport: true })`, `seedAccounts`, and admin and guest
    tokens. Seed one record per kind through `POST` (an activity-type first, for the
    activity's `type`).
  - A `BODY_OPS` table of the 14 operations (POST and PUT for items, locks, users,
    reservations, config, activity and activity-type), each with its valid body and a
    `read(id)` helper.
  - `describe.each(BODY_OPS)`:
    - (a) valid body plus `notAField: true` → 400, and `message` contains
      `property notAField should not exist`. For POST, the model's `countDocuments()` is
      unchanged (`app.get(getModelToken(X.name))`). For PUT, `read(id)` is deep-equal to before.
    - (b) `it.each(['createdAt', 'updatedAt', '__v'])` with value `'2000-01-01'`, or `0` for
      `__v` → 400.
    - (c) the valid body alone → 201 for POST, 200 for PUT. Green before and after.
  - For each POST: plus `_id: '64b000000000000000000001'` → 400, and no record with that id
    exists afterwards.
  - For each PUT:
    - plus `_id` equal to the path id → 200, the same as without it;
    - plus a different well-formed `_id` → 400 `_id must match the id in the path`, and the
      record is unchanged.
  - **App payload cases** (the shapes in the ground rules), each green before and after:
    - `PUT` a lock, an activity and an activity type with the app's body;
    - `PUT` a reservation with `_id`, items carrying `_id` and `userLock: '03'`;
    - assert 200, and for the reservation that each item keeps its `_id`.

    Mark the reservation case with a comment: it goes red after T004–T007 until T019 and T027
    land, so it's the US1/US3 joint gate.

  See (a), (b) and the POST `_id` and mismatched `_id` cases fail on today's code (201/200).
- [X] T009 [US1] In the same file, add the cross-cutting cases:
  - (a) `POST`/`PUT /api/reservations` with `items[0].y = 1` → 400
    `items.0.property y should not exist`.
  - (b) **checklist regression (R2)**: create an item, `PUT { checked: true, comments: 'ok' }`,
    then `PUT { label: 'x' }` → a `GET` shows `checked: true, comments: 'ok'`. Do the same for a
    reservation's item through `PUT { contact: 'z' }`. Green before and after.
  - (c) `POST /api/items` with `status: 'false'` → the same status and stored value as today.
    Run it once on the baseline and pin what it returns. Green before and after.
  - (d) **precedence**:
    - no token plus `notAField` → 401;
    - guest token on an admin route plus `notAField` → 403;
    - `PUT /api/items/abc` plus `notAField` → 400 `Invalid id "abc"`;
    - `PUT` on an unknown well-formed id plus `notAField` → 400 (the body is checked before
      the 404);
    - a mismatched `_id` with no token → 401.
  - (e) **queries**:
    - `GET /api/items/all?limit=5&offset=0&foo=1`, `/api/locks/all?…&foo=1`,
      `/api/users/all?…&foo=1`, `/api/reservations/all?foo=1` and `/api/activity?foo=1` → 400
      `property foo should not exist`;
    - the same without `foo` → 200;
    - `/api/config?foo=1` and `/api/activity-type?foo=1` → 200 (green before and after);
    - the app's reservation query
      `?dateFrom=2026-01-01&dateTo=2026-12-31&sort=asc&type=direct&validated=true&limit=10&offset=0`
      → 200.
  - (f) sign-in: `POST /api/login` with valid credentials plus `x: 1` → 201. Green before and
    after.

  See the 400 cases in (a), (d) and (e) fail on today's code.
- [X] T010 [P] [US1] Write `src/openapi/request-bodies.spec.ts` for a pure
  `closeRequestBodies(document: OpenAPIObject): OpenAPIObject`. Use a hand-built minimal
  document fixture:
  - a POST `/x` with body `$ref CreateX`, which nests `$ref Nested` via `items` (array);
  - a PUT `/x/{id}` with body `$ref UpdateX`;
  - a POST `/login` with body `$ref LoginRequestDto`;
  - a response-only `XResponseDto`.

  Assert:
  - (a) `CreateX`, `Nested` and `UpdateX` get `additionalProperties: false`;
  - (b) `LoginRequestDto` and `XResponseDto` don't;
  - (c) `UpdateX` gains an optional `_id` (`type: 'string'`, with the description from
    contracts §2), and `CreateX` doesn't;
  - (d) the input object isn't mutated.

  See it fail.
- [X] T011 [P] [US1] In `test/docs/contract-completeness.e2e-spec.ts`, add a test that loads
  the committed `openapi.json`:
  - (a) the set of closed schemas equals the 16 names in contracts/request-rules.md §1;
  - (b) `LoginRequestDto` is open;
  - (c) exactly the 8 change-body schemas in §2 declare `_id`.

  It fails until T017.

### Implementation for User Story 1

- [X] T012 [US1] Create `src/reservations/dto/reservation-item.dto.ts`:
  `export class ReservationItemDto extends CreateItemDto`, adding
  `@IsOptional() @IsMongoId() @ApiPropertyOptional({ description: "The checklist entry's id; keeps it across saves." }) readonly _id?: string;`.
  In `src/reservations/dto/create-reservation.dto.ts`, change `items` to `ReservationItemDto[]`
  with `@Type(() => ReservationItemDto)`. Add a comment on R5: an embedded entry's id, not a
  record id, and `POST /api/items` still refuses `_id`.
- [X] T013 [US1] Run the **whole** e2e suite (`pnpm test:e2e`). Expected red, and nothing else:
  - the D5 pin in `contract-discrepancies` (retired in T030);
  - T008's reservation app-payload case (until T027);
  - T011 (until T017).

  Any other failure is an existing test sending an undeclared field or parameter. Fix that
  test's request and record it for the PR.
- [X] T014 [US1] Create `src/openapi/request-bodies.ts` with `closeRequestBodies`, exactly as
  R7 and T010 describe:
  - deep-clone the input;
  - walk each operation's `requestBody.content['application/json'].schema` `$ref`, recursing
    through component `properties` (`$ref` and `items.$ref`);
  - set `additionalProperties = false`, except
    `const OPEN_REQUEST_BODIES = new Set(['LoginRequestDto'])`, with a comment that sign-in uses
    `@ApiBody` without `@Body()`;
  - for operations whose path has `{id}`, add the optional `_id` property to the top-level
    body schema.

  Type it with `@nestjs/swagger`'s `OpenAPIObject`, `SchemaObject` and `ReferenceObject`, with
  no `any`. T010 goes green.
- [X] T015 [US1] In `src/openapi/openapi-document.ts`, return
  `closeRequestBodies(SwaggerModule.createDocument(app, config))`. Update the function comment.
  `src/openapi/openapi-document.spec.ts` stays green.
- [X] T016 [US1] Run `pnpm exec jest src/common src/openapi` and
  `pnpm test:e2e -- test/records/unknown-fields.e2e-spec.ts`. Everything is green except the
  reservation app-payload case.
- [X] T017 [US1] Run `pnpm docs:export`, then `git diff --stat openapi.json` and `git diff
  openapi.json`. The changes MUST be only:
  - `additionalProperties: false` on the 16 schemas;
  - `_id` on the 8 change schemas;
  - the new `ReservationItemDto`, with `CreateReservationDto.items` referencing it.

  T011 goes green. If anything else changed, stop and explain why.

**Checkpoint**: US1 refuses everything it should. The MVP is done once US3's `userLock` lands
(the joint gate in T008).

---

## Phase 4: User Story 2 - The device's tank-level report is held to the same rule (Priority: P2)

**Goal**: `PATCH /api/config/:id` refuses undeclared fields. Valid reports and the wrong-key 404
(D10) are unchanged.

**Independent Test**: `pnpm test:e2e -- test/records/unknown-fields.e2e-spec.ts -t "device"`.

- [X] T018 [US2] Write this before T004. In `test/records/unknown-fields.e2e-spec.ts`, add
  `describe('device tank-level report')`, using the device auth from
  `test/records/record-ids.e2e-spec.ts`. Seed a config, then:
  - (a) device body plus `x: 1` → 400 naming `x`, and `GET /api/config` shows `analogLecture`
    unchanged;
  - (b) the valid body alone → 200 with the new reading (green before and after);
  - (c) a wrong `apiKey` → 404 (D10, green before and after);
  - (d) a wrong `apiKey` plus `x` → 400;
  - (e) the body plus `_id` equal to the path id → 200;
  - (f) the body plus a different `_id` → 400.

  See (a), (d) and (f) fail on today's code.
- [X] T019 [US2] No production change: Foundational and T014 cover it. Run T018 green, and
  confirm in `openapi.json` that `TankLevelConfigDto` is closed and declares `_id`.

**Checkpoint**: US2 works on its own.

---

## Phase 5: User Story 3 - A reservation keeps the lock it is assigned (Priority: P2)

**Goal**:
- `userLock` is declared: a lock user slot (0–19) or a lock code id, with an empty value
  removing the lock.
- It's stored as sent and answered as `userLock`.
- `lockUser` is refused.
- Stored values are never touched (R6).

**Independent Test**: `pnpm test:e2e -- test/reservations/reservation-lock.e2e-spec.ts`.

### Tests for User Story 3 ⚠️ (write first, see them fail)

- [X] T020 [P] [US3] Write `src/validators/lock-reference.validator.spec.ts` for
  `IsLockReference()`, validating a small decorated class with `validate()` from
  class-validator:
  - accepted: `'03'`, `'0'`, `'19'`, `'64b000000000000000000001'`, `''`, `null`, `undefined`;
  - refused: `'20'`, `'ul'`, `'64b0'` and `5` (a number, not a string);
  - the message is `userLock must be a lock user slot (0–19) or a lock id`.

  See it fail.
- [X] T021 [P] [US3] Create `test/reservations/reservation-lock.e2e-spec.ts`:
  `describe('Reservation lock (010)')`, with a header citing specs/010-fix-unknown-fields, #20
  and D15. Use a distinct date pair per create. Cases:
  - (a) `POST` with `userLock: '03'` → 201 with `userLock: '03'`, and `GET` by id →
    `userLock: '03'`.
  - (b) `PUT { userLock: '05' }` → a `GET` shows `'05'`.
  - (c) `PUT { contact: 'z' }` → still `'05'`.
  - (d) `PUT { userLock: '' }` (the only field, so the update has no `$set`) → 200, and the
    `GET` has no `userLock` property. Repeat with `null`, and with `{ userLock: '', contact: 'z' }`.
  - (e) `POST` with `userLock: 'ul'` → 400 naming `userLock`.
  - (f) **older id-valued lock**: insert a reservation with
    `userLock: '64b000000000000000000009'` through the model; `GET` → unchanged; then `PUT`
    the app's payload with the same `userLock` → 200 (green before and after).
  - (g) `POST` with `lockUser: '3'` → 400 `property lockUser should not exist`.
  - (h) `GET /api/reservations/all` includes `userLock` for (a)'s record.

  See (d), (e) and (g) fail on today's code (today `lockUser` is declared, and `''` is stored).
- [X] T022 [P] [US3] In `src/reservations/reservations.service.spec.ts`, using the file's
  mock style:
  - (a) `update(id, { userLock: '' })` calls `findByIdAndUpdate(id, { $unset: { userLock: '' } }, { new: true })`
    with no `$set` key, and the same for `null`. `update(id, { userLock: '', contact: 'z' })`
    calls it with `{ $set: { contact: 'z' }, $unset: { userLock: '' } }`;
  - (b) `update(id, { userLock: '03', contact: 'z' })` calls it with
    `{ $set: { userLock: '03', contact: 'z' } }` and no `$unset`;
  - (c) `create({ ...valid, userLock: '' })` constructs the model without `userLock`.

  See it fail.

### Implementation for User Story 3

- [X] T023 [US3] Create `src/validators/lock-reference.validator.ts`, following
  `digital-number.validator.ts`'s structure: a `@ValidatorConstraint` plus an
  `IsLockReference(options?)` decorator. Accept:
  - `''`, `null` or `undefined`;
  - or a string that passes the `IsDigitalNumberConstraint` rule with limit 20 (reuse it, don't
    copy it);
  - or `isMongoId(value)` from class-validator.

  T020 goes green.
- [X] T024 [US3] In `src/reservations/dto/create-reservation.dto.ts`, delete `lockUser`
  (decorators included). Add:
  `@IsOptional() @IsLockReference() @ApiPropertyOptional({ description: "The assigned lock: a lock code's user slot (e.g. 03), or a lock code's id for older reservations. Empty removes the lock.", nullable: true }) readonly userLock?: string | null;`
  `UpdateReservationDto` inherits it through `PartialType`.
- [X] T025 [US3] In `src/reservations/reservations.service.ts`:
  - `create`: if `userLock` is `''` or `null`, construct the model from the DTO without it.
  - `update`: split an empty `userLock` into `$unset: { userLock: '' }`, and keep everything else
    in `$set`. Include `$set` only when it has keys: an empty `$set` depends on the server
    version. Keep the existing await-then-404 shape.
  - Add a comment: an empty value means "Ninguna" (no lock), US3 scenario 3.

  T022 goes green.
- [X] T026 [P] [US3] In `src/reservations/dto/reservation-response.dto.ts`, add
  `userLock?: string;` after `contact`, with no decorator: the file relies on the Swagger CLI
  plugin, like its other fields. Comment it: the lock's user slot, or an older reservation's
  lock id.
- [X] T027 [US3] Run `pnpm docs:export`. This phase's `openapi.json` diff MUST be only:
  - `lockUser` → `userLock` in `CreateReservationDto` and `UpdateReservationDto`;
  - `userLock` added to `ReservationResponseDto`.

  Run T020, T021 and T022 green, plus T008's reservation app-payload case. That's the joint
  gate.

**Checkpoint**: all three stories work, and the app's payloads pass end to end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T028 Check for leftovers:
  - `grep -rn "lockUser" src test` must find only the refusal tests;
  - `grep -rn "new ValidationPipe" src` must find only the route-level query pipes and
    `RequestValidationPipe`;
  - confirm the `pnpm db:setup` seed under `scripts/` writes through models, so the rules
    don't affect it.
- [X] T029 [P] In `specs/005-openapi-contract-export/discrepancies.md`, add a
  `- **Status**: Resolved by \`specs/010-fix-unknown-fields\` (<date>).` line to D5 and to
  D15, in the D2/D7 style:
  - **D5**: bodies and queries are strict and own `_id` is allowed on changes. Evidence:
    `test/records/unknown-fields.e2e-spec.ts`.
  - **D15**: `lockUser` is removed and `userLock` declared. Evidence:
    `test/reservations/reservation-lock.e2e-spec.ts`.
- [X] T030 In `test/docs/contract-discrepancies.e2e-spec.ts`, remove the `D5:` and `D15:`
  tests, and anything only they used. Add to the header's "Not here" sentence: "D5 and D15 are
  fixed by specs/010-fix-unknown-fields (pinned by test/records/unknown-fields.e2e-spec.ts and
  test/reservations/reservation-lock.e2e-spec.ts)".
- [X] T031 [P] In `CLAUDE.md`, under Stack & decisions › Hardening, replace "global
  `ValidationPipe`" with "global `RequestValidationPipe` (strict bodies and queries; a
  change may repeat its own `_id`)".
- [X] T032 Set `**Status**: Implemented` in `specs/010-fix-unknown-fields/spec.md`, and tick
  every task here.
- [ ] T033 Commit the work, excluding the screenshots, with imperative summaries and a body
  explaining why. Then run `VERIFY_E2E=1 pnpm verify` on the clean tree. Record the e2e result
  and the coverage: 80% overall and `src/auth` ≥ 90% must not drop.
- [ ] T034 Run the quickstart's scenarios 1–11 against `pnpm start:dev`, then scenario 12: the
  Flutter app against the local API. Edit a reservation (checklist plus lock), a lock code, an
  activity and an activity type, and browse every list. Record the outcome.
- [ ] T035 Open the PR from `010-fix-unknown-fields` with `Closes #10` and `Closes #20`. It must
  state:
  - the principles touched (I, II, III, IV);
  - **the IV violation** (no versioned path), accepted by the owner as a defect fix, with a
    link to the clarification;
  - what newly gets 400: extra fields and parameters, `lockUser`, and invalid `userLock`;
  - the spec 009 note: its reservation field list must keep `userLock` (R9);
  - every test fixed in T013;
  - the e2e result and the app check from T034;
  - whether `--no-verify` was used.

  After the merge, check that both issues closed.

---

## Dependencies & Execution Order

- **Setup (T001)** comes first.
- **Test-first order**: T002, T003, T008, T009, T018, T020, T021 and T022 are written and seen
  failing **before** any implementation (T004 onwards).
- **Foundational (T004–T007)** blocks every story.
- **US1 (T010–T017)**: after Foundational. T012 must come before T013's full-suite run.
- **US2 (T019)**: after Foundational. It shares T008's file.
- **US3 (T023–T027)**: T023 → T024 → T025. T026 can run in parallel. T027 needs T017's export
  to have happened (both write `openapi.json`, so regenerate last).
- **Joint gate**: T008's reservation app-payload case is green only after T012 and T024–T025.
- **Polish (T028–T035)**: after every story.

### Parallel opportunities

- Tests: T002, T003, T008 (with T009 and T018 then in the same file, sequentially), T010, T011,
  T020, T021 and T022 touch different files.
- Implementation: T004 and T005; T012 and T023; T014 and T026; T029 and T031.

## Parallel Example: test-first batch

```text
Task: "T002 request-validation.pipe.spec.ts"
Task: "T003 own-id.interceptor.spec.ts"
Task: "T008 test/records/unknown-fields.e2e-spec.ts"
Task: "T020 lock-reference.validator.spec.ts"
Task: "T021 test/reservations/reservation-lock.e2e-spec.ts"
Task: "T022 reservations.service.spec.ts (empty userLock)"
```

## Parallel Example: User Story 3

```text
Task: "T023 lock-reference.validator.ts"
Task: "T026 userLock in reservation-response.dto.ts"
```

---

## Implementation Strategy

### MVP

Foundational, then US1, then US3's `userLock` (T023–T025). The mass-assignment hole is closed
and the app still works. Ship nothing between those steps: Foundational alone breaks the app's
reservation saves.

### Incremental within the PR

1. Foundational plus US1: undeclared fields, ids and dates, and queries refused; the contract
   closed.
2. US2: the device covered (tests only).
3. US3: `userLock` declared and `lockUser` gone, which closes the joint gate.
4. Polish: the register, the pins, `CLAUDE.md`, the gates, the app check and the PR.

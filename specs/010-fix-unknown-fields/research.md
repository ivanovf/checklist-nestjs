# Research: Refuse Unknown Fields in Requests

All findings were observed by running the code on 2026-10-01:
- an e2e probe against the real app (`configureApp`);
- unit spikes on `ValidationPipe`;
- a Nest spike app combining the chosen pipe and interceptor with real DTOs and
  `ParseObjectIdPipe`.

The probes were throwaway and were deleted afterwards. The mobile app's payloads were read from
its source (`flutter/reservations`, the `toJson()` models and the `*_service.dart` calls).

## R1 — Root cause of D5

**Finding**: `configureApp` (`src/bootstrap.ts`) registers
`new ValidationPipe({ transformOptions: { enableImplicitConversion: true } })`. Without
`whitelist`, class-validator never looks at undeclared properties, and the pipe returns the
original value. The services pass the DTO straight to Mongoose, which drops names the schema
doesn't have and **stores** the ones it does: `_id`, `createdAt`, `updatedAt` and a reservation's
`userLock`.

**Observed**: `POST /api/items` with `_id` and `createdAt: 2000-01-01` → 201, with that id and
date stored. The same happened on all seven kinds of record and on the device `PATCH`.
`?foo=1` → 200 on every list.

## R2 — Why not just add `whitelist` and `forbidNonWhitelisted` to the global pipe

**Decision**: Rejected. The refusals are right, but the pipe then hands the services a rebuilt
object, which changes valid requests (FR-005).

**Observed**: with any validator option set, `ValidationPipe` returns `classToPlain(instance)`:

| Valid request today | Service receives today | With the naive fix |
|---|---|---|
| `PUT /items/:id` `{ "label": "x" }` | `{ label: "x" }` | `{ checked: false, comments: "", label: "x" }` |
| `POST /items` `{ …, "status": "false" }` | `"false"` (stored `false`) | `true` |

1. `CreateItemDto` initialises `checked = false` and `comments = ''`, and `PartialType`
   inherits the initialisers. So every partial item edit would uncheck the item and erase
   its comments.
2. Implicit conversion turns `"false"` into `true`.

## R3 — The chosen check: strict on bodies **and queries**, value passed on as sent

**Decision**: A shared `RequestValidationPipe` (`src/common/pipes/`) replaces the inline pipe.
It composes two `ValidationPipe`s:

- **Bodies and queries**: `whitelist: true`, `forbidNonWhitelisted: true` plus the existing
  `transformOptions`. When validation passes, the pipe returns **the original value**. That is
  safe because undeclared properties are refused at every depth, and it is exactly what reaches
  the handler today.
- **Params and custom arguments**: today's configuration, unchanged.

**Why queries are included**: the clarification follows Principle IV. Unknown query
parameters are refused.

**Why returning the original query is still correct**:
- The route-level query pipes (items, locks, users, activity types and configurations with
  `PaginationQueryDto`, reservations with `FilterReservationsDto`, and activities with
  `FilterActivityDto`) run after the global pipe and still transform the value and apply its
  defaults. The last three gained their pipes in `specs/011-fix-unbounded-lists`, which was
  merged while this feature was in progress.

**Observed** (spike, with the real DTOs):

| Request | Result |
|---|---|
| `GET …?limit=5&offset=0&validated=true` (reservations) | 200, `{limit:5, offset:0, sort:'desc', validated:true}`, as today |
| `GET …` with no parameters (reservations) | 200, with the defaults `{limit:10, offset:0, sort:'desc'}` |
| `GET …?limit=5&foo=1` | **400** `property foo should not exist` |
| activity `?price=3&status=TODO` | 200, `price` still the string `"3"`, as today |
| activity `?foo=1` | **400** |
| reservation item with `y`, `PartialType` and `IntersectionType` bodies | refused, nested path named (`items.0.property y should not exist`) |

**Lists covered**: all seven. When this research was done, the configuration and
activity-type lists bound no `@Query()` and ignored their query. Spec 011 gave them paging,
so they are held to the same rule, and the e2e suite covers all seven.

**Constraint for future DTOs**: a nested object or array needs `@ValidateNested` + `@Type`, or
its contents aren't checked. Today that's only a reservation's `items`.

**Alternatives considered**:
- A `ValidationPipe` subclass overriding `transform`. Rejected because it depends on private
  behaviour.
- Per-route pipes. Rejected because they're opt-in, against FR-006.

## R4 — A record's own `_id` on a change (clarification Q5)

**Finding**: the mobile app sends `_id` when it edits reservations, lock codes, activities and
activity types, and an `_id` on every checklist item. On creates its model has no id, so it
sends none. User edits remove `_id` before sending.

**Decision**: a global `OwnIdInterceptor` (`src/common/interceptors/`). When the route has an
`:id` path parameter and the body is an object containing `_id`:
- if it equals the path id, the interceptor **deletes** it from the body;
- otherwise it throws 400 `_id must match the id in the path`.

Interceptors run after guards and before pipes, so:
- access refusals keep precedence (401, then 403);
- the strict pipe never sees a matching `_id` on a change;
- on a create there's no `:id`, so the pipe refuses `_id` as undeclared (FR-004).

**Observed** (spike):

| Request | Result |
|---|---|
| `PUT /:id` with `_id` equal to the path | 200, and the handler receives the body without `_id` |
| `PUT /:id` with a different `_id` | 400 `_id must match the id in the path` |
| `PUT /abc` with `_id: "abc"` | 400 `Invalid id "abc"`: the path check still wins (spec 008) |
| `PUT /:id` with `createdAt` | 400 `property createdAt should not exist` |

**Rationale**:
- One central rule covers all eight change operations (seven PUTs and the device PATCH) and
  any future one (FR-006).
- No DTO or service needs to know about `_id`.
- Deleting the matching `_id` means `$set` never touches the immutable `_id`.

**Alternatives considered**:
- Declare `_id` in each Update DTO and compare it in the services. Rejected: that's eight
  opt-ins and duplicated logic.
- Change the app (clarification option B). Rejected by the owner.

## R5 — A checklist item's `_id` inside a reservation

**Decision**: a new nested DTO, `ReservationItemDto extends CreateItemDto`, adding
`@IsOptional() @IsMongoId() _id`. `CreateReservationDto.items` switches to
`@Type(() => ReservationItemDto)`. `POST /api/items` keeps `CreateItemDto`, where `_id` stays
undeclared and refused.

**Rationale**: an embedded item's `_id` identifies the checklist entry, not a top-level record.
The app sends it so entries keep their identity across saves, and today Mongoose stores it. The
interceptor only handles top-level `_id`.

## R6 — The reservation lock (`userLock`, clarification Q4)

**Finding** (app source):
- The app stores the lock's user slot (e.g. `"03"`) in `userLock`.
- Older reservations hold a lock code's `_id`.
- The app resolves both forms against the lock list (`_lockFor`, `access_section.dart`) to show
  "Usuario 03 · 2231".
- `CreateReservationDto.lockUser` (`IsDigitalNumber(10)`, so 0–9) has never been stored or read.

**Decision**:
- **The schema is unchanged**: the path stays `userLock`, so there's no data migration.
- **DTO**: delete `lockUser`. Add an optional `userLock` with a custom
  `IsLockReference()` validator, which accepts a user slot by the same rule as
  `CreateLockDto.userNumber` (`IsDigitalNumber(20)`) or a well-formed id (`isMongoId`). `null`
  and `''` pass, since an empty value means "no lock".
- **Service**: in `create` and `update`, an empty `userLock` (`''` or `null`) becomes `$unset`
  (on create, it's simply left out), so reads show no lock (US3 scenario 3). Any other value is
  stored as sent.
- **Contract**: `ReservationResponseDto` documents the optional `userLock` it already returns,
  and the request schemas show `userLock` instead of `lockUser`.

**Alternatives considered**: linking to the lock code record by id with populated answers
(deferred by the owner to a later spec); free text (option B, rejected).

## R7 — The contract

**Decision**: `buildOpenApiDocument` post-processes the generated document with a pure helper
(`src/openapi/request-bodies.ts`):
1. **Close** every schema reached from an operation's `requestBody` (recursively through
   `$ref` and array `items`) with `additionalProperties: false`, except
   `OPEN_REQUEST_BODIES = {'LoginRequestDto'}`. Sign-in documents its body with `@ApiBody` but
   doesn't bind it with `@Body()`.
2. For operations with an `{id}` path parameter and a request body, add an optional `_id`
   (`string`, "May repeat the id in the path; any other value is refused") to that body
   schema. Update schemas and `TankLevelConfigDto` are used only by change operations, so the
   added property is accurate.

The 400 status is already documented on all 15 body operations and on the 7 lists with
declared parameters, so no `@ApiRefusals` changes.

## R8 — The test app must use the real request rules

`test/security/app-factory.ts` copies the old pipe when `transport` is off. Decision: export
`applyRequestRules(app)` from `src/bootstrap.ts`, which registers `RequestValidationPipe` and
`OwnIdInterceptor`. `configureApp` and the factory both call it, so the two can't drift.

## R9 — Coordination with spec 009 (unprojected records, another branch)

009 replaces raw documents with a defined field list per record. Its reservation field list
must include `userLock`, which it does if it follows today's answers. Otherwise the app loses
the lock. 010's e2e suite asserts `userLock` in answers, so a merge that drops it fails. This
goes in the PR description.

## R10 — Clients

**Mobile app**: compatible without a release.
- List parameters: all declared (`limit`, `offset`, `sort`, `dateFrom`, `dateTo`, `type`,
  `validated`, `status`).
- `_id` on changes: accepted by R4.
- Item `_id`s: accepted by R5.
- `userLock`: accepted by R6.

The PR still asks for a smoke test of the app's edit screens. **Device**: it sends
`analogLecture`, `apiKey` and `time`, all declared. **Scripts or other callers** sending
extra fields or parameters get 400, flagged as a behaviour change (Principle IV, decided as a
defect fix).

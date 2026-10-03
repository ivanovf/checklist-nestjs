# Research: Wrongly Typed Fields Are Refused, Not Server Errors

**Feature**: `specs/014-fix-mistyped-fields` | **Date**: 2026-10-02

Everything below was run, not read, unless it says otherwise. Probes ran against the e2e test
app (`createTestApp({ transport: true })`, `mongodb-memory-server`): first against `dev` at
`5df7848`, then against a spike of the design (R2–R5), which was then reverted. The clients
were checked in their sources: the Flutter app (`flutter/reservations`, commit `a356bdb`, the
`toJson()` models and `*_service.dart` calls) and the device sketches (`Arduino/`).

## R1: Root cause of D8

**Finding**: the global `RequestValidationPipe` (spec 010, R3) validates bodies with
`transformOptions: { enableImplicitConversion: true }` and then passes on **the value as
sent**. class-transformer converts each sent value to the property's design type before
class-validator checks it. So the check runs on a converted copy, and the service stores the
original:

| Sent | Converted for the check | Check | Stored | Result |
|---|---|---|---|---|
| `label: {…}` | `"[object Object]"` | `IsString` passes | the object | Mongoose cast error, **500** |
| `status: "abc"` / `7` | `true` | `IsBoolean` passes | `"abc"` / `7` | cast error, **500** |
| `dateIni: true` | `new Date(true)` | `IsDate` passes | `true` | cast error, **500** |
| `cost: "abc"` | not checked (no validator) | none | `"abc"` | cast error, **500** |
| `label: 7` | `"7"` | passes | `7` | Mongoose casts to `"7"`, **200** |
| `budget: true` | `1` | `IsNumber` passes | `true` | Mongoose casts to `1`, **200** |
| `dateIni: 7` | `new Date(7)` | passes | `7` | stored as 1970-01-01T00:00:00.007Z, **200** |
| `changePassword: "abc"` | `true` | passes | `"abc"` | truthy in the service, read as yes, **200** |

A list (`["x"]`) is refused today because class-transformer doesn't convert arrays to scalars.

The second defect, `null` on a change, is separate. `PartialType` marks every field
`@IsOptional()`, which skips validation for `undefined` **and `null`**, so `{ label: null }`
passes and is stored.

**Observed scope**, 2026-10-02: 49 field-and-value combinations answered 500, not counting
D12's role. Every route with a body was affected on create and change except locks, whose
`IsDigitalNumber` happens to refuse objects and booleans. The register's claim that activity
types and activities answer 400 is wrong; both answer 500 for an object in a text field.

## R2: Bodies are validated without implicit conversion

**Decision**: `RequestValidationPipe` validates bodies with a third `ValidationPipe` that has
`whitelist` and `forbidNonWhitelisted` but **no** `enableImplicitConversion`. It still returns
the value as sent. Queries keep today's strict pipe with conversion, and params keep the
lenient one.

**Why queries differ**: a query value is always text, so it has to be converted to be checked.
The route-level query pipes (`PaginationQueryDto`, `FilterReservationsDto`, `FilterActivityDto`)
then convert and default it for the handler, as spec 010 R3 describes. A body is JSON, which
carries its own kinds, so a body value can be checked as it is.

**Observed** (spike, with this change and R3–R5): of the 406 probe requests (7 values × every
field × create and change), 336 were refused with 400. The 70 that succeeded all sent a value
of the declared kind: text for text, a yes/no for a yes/no, a number for a number, or `null`
for an optional field. 0 answered 500.

**Effect on existing tests** (full e2e and unit suites on the spike):
- `test/docs/contract-discrepancies.e2e-spec.ts` › D8 fails, as intended. It is retired.
- `test/records/unknown-fields.e2e-spec.ts` › "a status sent as the text "false" is stored as
  false, as before" fails (now 400). Spec 010 kept text `"false"` working because it worked
  then. FR-005 (clarified) now refuses text for yes/no. **The test is inverted**, and the PR
  flags the change.
- `src/common/pipes/request-validation.pipe.spec.ts` › "passes values on unconverted" fails for
  the same `"false"` sample. It is rewritten with a date text, which is still passed on as
  text, so it keeps proving "passed on as sent".
- Everything else passed: 845 of 848 e2e (the third failure, `reservation-lock`, was caused by
  the probe file running in the same database; it passes 9/9 alone), and 432 of 433 unit tests.

**Alternatives considered**:
- *Return the converted instance.* Rejected. It brings back spec 010 R2's regressions
  (inherited initialisers uncheck items and erase comments; `"false"` becomes `true`), and it
  would store `"[object Object]"` as a label.
- *A global filter mapping Mongoose `CastError`/`ValidationError` to 400.* Rejected as the fix.
  It turns 500 into 400, but the silent conversions (US2) and empty required fields (US3)
  would remain, because those requests succeed. It would also change D12, which is out of
  scope. It is still worth considering later as defence in depth.
- *Per-field `@Type(() => …)`.* Rejected. `@Type(() => Date)` turns `7` and `true` into valid
  dates, which is the conversion FR-004 forbids.

## R3: Dates are checked as date text

**Decision**: a new validator, `IsDateText()` in `src/validators/`, replaces `@IsDate()` on
`CreateReservationDto.dateIni`, `dateEnd` and `CreateActivityDto.date`. It accepts a string
that is strict ISO 8601 **and** parses to a real date. Anything else is refused with
`<field> must be a date in ISO 8601 format`.

**Why**: JSON has no date kind, so every client sends dates as text. Without implicit
conversion, `@IsDate()` refuses all text and would break every client. `@IsISO8601()` alone
isn't enough:

| Value | `isISO8601` | `{ strict: true }` | `new Date(v)` |
|---|---|---|---|
| `2026-01-01T00:00:00.000` (the app's format) | ✓ | ✓ | valid |
| `2026-01-01T00:00:00.000Z`, `2026-01-01` | ✓ | ✓ | valid |
| `2026-02-30` | ✓ | ✗ | 1 March: silently moved |
| `20260101`, `2026-W01` | ✓ | ✓ | **Invalid Date**: Mongoose cast error, a new 500 |
| `2026-13-01` | ✗ | ✗ | Invalid Date |

So the validator requires both strict ISO 8601 and a valid `Date`. `20260101` and `2026-W01`
are refused today (`IsDate` on an Invalid Date) and stay refused. `2026-02-30` is accepted
today and stored as 2 March. It becomes a refusal, which FR-004 covers (it isn't a date).

**Contract**: unchanged. The properties stay `Date` in TypeScript, so the schema stays
`string`/`date-time`.

## R4: The remaining fields without a type check

- **`CreateReservationDto.cost`** has only `@IsOptional()`. It gains `@IsNumber()`, so `null`
  still clears it and any non-number is refused (FR-006).
- **`CreateLockDto.lock` and `userNumber`** use only `IsDigitalNumber`, which runs `parseInt`
  and accepts the number `1234`. They gain `@IsString()` (FR-004, clarified: lock codes
  included).
- **Observed, out of scope**: `IsDigitalNumber` also accepts `"12ab"`, `" 7"`, `"0x10"` and
  `"1e3"` (run directly on the validator). This is a format rule, not a type rule, so it isn't
  D8. It is proposed as a new register entry (D18), to be opened as an issue only with the
  owner's approval, as D16 was.

## R5: `null` on a change

**Decision**: the six partial change DTOs (`UpdateItemDto`, `UpdateReservationDto`,
`UpdateLockDto`, `UpdateActivityDto`, `UpdateActivityTypeDto`, `UpdateConfigDto`) use
`PartialType(Create…Dto, { skipNullProperties: false })`. That option exists in the installed
`@nestjs/swagger` 7.4.2. It makes each field `ValidateIf(value !== undefined)` instead of
`IsOptional`: an omitted field is skipped, and a `null` field is validated and refused by its
type check.

**Optional fields stay clearable**: a field the create DTO itself marks `@IsOptional()` keeps
that decorator (it is inherited), so `null` still passes for `cost`, `userLock` (removes the
lock) and activity and activity-type `description`. Observed on the spike: those answered 200.

**Defaulted fields**: `checked` and `comments` aren't required on create (they default), but
they refuse `null` on create today. With this rule they refuse it on change too. The rule is
the same for both: **a change accepts, for each field it sends, exactly what a create accepts
for that field**.

**Not affected**: `UpdateUserDto` is an `IntersectionType` with every field required (D9), so
it already refuses `null`. `TankLevelConfigDto` isn't partial.

**Alternative considered**: a custom `UpdateType()` helper. Rejected, since the library option
does exactly this.

## R6: The contract

**Observed**: `pnpm docs:check` on the spike reported `openapi.json is up to date`. All 16
operations with a validated body already document **400** ("The request body, query or path
value is invalid."), and none documents 500. The contract already declared every field's kind.
This feature makes the API keep what the contract said.

FR-010 is therefore met without regenerating anything. `pnpm docs:check` stays in the gates to
prove it. If the date validator's metadata or the `skipNullProperties` option changed a
schema, the check would fail, and the export would be committed.

**Sign-in** (`POST /api/login`) is outside this rule. Passport reads its body, it documents
201/401/429, and a wrongly typed email or password was answered **401**, never 500 (probed).

## R7: Clients

**Mobile app**: compatible, checked in its source.
- Every model's `toJson()` sends the declared kinds: text as `String`, yes/no as `bool`,
  `quantity` as `int`, `cost`/`price`/`budget` as `num`, dates as
  `DateTime.toIso8601String()` (`2026-01-01T00:00:00.000`, accepted by R3), `userLock` only when
  set, lock codes as `String`.
- `null` on a change: reservation dates and type and an activity's date are nullable in the
  models, but the edit screens stop the save when they're empty
  (`reservation_detail_screen.dart` `_save`, `activity_detail_screen.dart`). Account changes
  send `name`, `email` and `role`, plus the password fields when changing it.
- It never sends text `"false"`.

**Device** (`PATCH /api/config/:id`): no sketch in `Arduino/` sends this body. The only tank
sketch calls an old Heroku URL and has no `analogLecture` payload. The device can't be
verified from source, so the PR flags it: a reading or time sent as text would now be 400
instead of being stored. Spec 010 R10 recorded it as sending `analogLecture`, `apiKey` and
`time`.

**Other callers** (scripts) sending text for numbers or yes/no, numbers for text, or `null`
for required fields on a change get 400. This is flagged as a behaviour change and treated as
a defect fix (spec Assumptions).

## R8: Tests

- One new e2e suite, `test/records/field-types.e2e-spec.ts`. It is table-driven over every
  kind and field: wrong value × create/change → 400 naming the field, and the stored record
  unchanged. It also covers nested reservation entries, `null` on change (required → 400,
  optional → 200), date formats, the device route (D10's 404 for a well-typed wrong key is
  kept), one recovery case, and an "app payload" case per kind using the Flutter `toJson()`
  shapes, which must pass before and after.
- Unit: `IsDateText` spec, and the pipe spec (bodies unconverted, queries still converted).
- The register's pinning test for D8 is removed. The 010 `"false"` test is inverted.

## R9: Compatibility (Principle IV)

**Decision**: closing a defect, not a versioned change, as specs 007 (R6), 008 (R7) and 011
(R7) decided for their newly refused values.

**Why**: the contract has always declared each field's kind, and the changes refuse only
requests that broke it: text `"false"` or `"abc"` for a yes/no, numbers or yes/no for text
(lock codes included), `true` for a number, a number or an impossible date for a date, and
`null` for a field a create requires. No published schema changes (R6). The only known client
sends the declared kinds (R7). A `/v2` copy of 16 operations to keep accepting contract
violations would serve no one.

**Flagged**: the PR lists each newly refused kind, the unverified device payload, and the
inverted spec 010 test (`status: "false"`).

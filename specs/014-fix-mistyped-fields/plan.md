# Implementation Plan: Wrongly Typed Fields Are Refused, Not Server Errors

**Branch**: `014-fix-mistyped-fields` | **Date**: 2026-10-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/014-fix-mistyped-fields/spec.md` (clarified
2026-10-02). Fixes issue [#13](https://github.com/ivanovf/checklist-nestjs/issues/13) (D8).

## Summary

Bodies are checked after implicit conversion, but the value as sent is what gets stored
(R1). So an object passes as a label and then crashes storage (500). A number passes as a
date and is stored as 1970. Separately, `PartialType` lets `null` through on every change.

The approach was spiked end to end, and the spike was reverted. It produced 0 server errors
in 406 probe requests, and every existing e2e and unit test passed except the two that pin the
old behaviour.

1. **`RequestValidationPipe`**: bodies are validated **without implicit conversion**. Queries
   and params are unchanged (R2).
2. **Dates**: a new `IsDateText()` validator replaces `@IsDate()` on the three date fields. It
   requires strict ISO 8601 that parses to a real date, because `IsISO8601` alone would let
   `20260101` through to a new 500 (R3).
3. **Missing type checks**: `cost` gains `@IsNumber()`. The lock `lock` and `userNumber`
   fields gain `@IsString()` (R4).
4. **`null` on change**: the six partial change DTOs use
   `PartialType(…, { skipNullProperties: false })`. Fields the create DTO marks optional stay
   clearable (R5).
5. **Contract**: `openapi.json` is unchanged (verified). It already declared every kind and
   400 (R6).
6. **Register**: D8 corrected and resolved, the pin retired, and D18 (lock-code format)
   proposed (R4).

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) on Node 24.x

**Primary Dependencies**: NestJS 10 (`ValidationPipe`), class-validator 0.14 (`isISO8601`,
`registerDecorator`), class-transformer 0.5, @nestjs/swagger 7.4.2 (`PartialType` with
`skipNullProperties`), Mongoose 8. **No new dependency.**

**Storage**: MongoDB. No schema, index or data change. Values already stored converted (labels
`"7"`, dates in 1970) are not repaired. None are known, and the app never sends those kinds
(R7).

**Testing**: Jest unit tests (`pnpm test`); e2e with `mongodb-memory-server`, `--runInBand`.
Gates via `VERIFY_E2E=1 pnpm verify` (CI is billing-locked).

**Target Platform**: Vercel serverless (Node), plus a local server

**Project Type**: web-service (REST API), consumed by the Flutter app and the tank-level device

**Performance Goals**: within the existing budgets. Validation does less work (no
conversion), with no new I/O.

**Constraints**:
- Correctly typed requests keep their exact outcome and stored record (FR-003). The spike
  passed 845 e2e tests unchanged.
- The mobile app keeps working without a release. Its payloads were checked in source (R7),
  and the e2e suite replays them.
- D9, D10, D12, D13 and D16 keep their pinned behaviour.
- Queries keep implicit conversion.

**Scale/Scope**:
- New: 1 validator (+ spec), 1 e2e suite.
- Changed: the pipe (+ spec), 3 create DTOs (reservation, activity, lock), 6 update DTOs.
- Tests: the 010 `"false"` test inverted, the D8 pin removed.
- Docs: the register and the `CLAUDE.md` hardening line. `specs/README.md`, which
  `CLAUDE.md` names as the product state, doesn't exist on this branch.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Test-first | ✅ | The `field-types` suite and the `IsDateText` and pipe specs are written first and seen failing: 500s and silent 2xx today. The regression for D8 is the suite itself. App payload cases pass before and after. |
| II. Layering | ✅ | The rule sits at the HTTP edge (pipe, DTO decorators). Services, controllers and schemas are unchanged, and there's no `any`. |
| III. Secure by default | ✅ | `changePassword: "abc"` is no longer read as yes. Mistyped values can no longer reach Mongoose. |
| IV. Validated, documented contracts | ✅ ⚠️ flagged | The global pipe now enforces each body DTO's declared kinds, and no Mongoose error reaches a client from a wrongly typed field: the principle is being satisfied, not bent. The published contract is unchanged, because it already declared every kind. Requests that succeed today with the wrong kind are refused in place. As in specs 007, 008 and 011, this is treated as closing a defect, not a versioned change ([R9](research.md#r9-compatibility-principle-iv)), and the PR flags it. The owner chose it (clarification Q1). |
| V. Observability & performance | ✅ | No queries or indexes change. |
| Security standards | ✅ | No data migration and no production access. |
| Workflow | ✅ | Feature branch from `dev`, PR to `dev`, `VERIFY_E2E=1 pnpm verify`, and the e2e result stated. |

**Result**: PASS, with the in-place behaviour change flagged for the PR (R9).

**Re-check after design**: PASS. `UpdateUserDto` and `TankLevelConfigDto` aren't partial and
need no change for `null`. Sign-in is outside the body pipe's reach (Passport) and answers 401
(R6).

## Project Structure

### Documentation (this feature)

```text
specs/014-fix-mistyped-fields/
├── spec.md
├── plan.md
├── research.md             # R1–R8: root cause, spike results, dates, null, contract, clients
├── data-model.md           # every body field's kind, create/change/null rules, refusal order
├── quickstart.md
├── contracts/
│   └── request-types.md    # before → after per kind of mistyped value
├── checklists/
│   └── requirements.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
src/common/pipes/
├── request-validation.pipe.ts        # body pipe without implicit conversion
└── request-validation.pipe.spec.ts   # "unconverted" sample → date text; new: mistyped refused
src/validators/
├── date-text.validator.ts            # NEW: IsDateText (strict ISO 8601 + real date)
└── date-text.validator.spec.ts       # NEW
src/reservations/dto/create-reservation.dto.ts   # dateIni/dateEnd IsDateText; cost IsNumber
src/reservations/dto/update-reservation.dto.ts   # skipNullProperties: false
src/activity/dto/create-activity.dto.ts          # date IsDateText
src/activity/dto/update-activity.dto.ts          # skipNullProperties: false
src/locks/dto/create-lock.dto.ts                 # lock/userNumber IsString
src/locks/dto/update-lock.dto.ts                 # skipNullProperties: false
src/items/dto/update-item.dto.ts                 # skipNullProperties: false
src/activity-type/dto/update-activity-type.dto.ts# skipNullProperties: false
src/config/dto/update-config.dto.ts              # skipNullProperties: false
test/records/field-types.e2e-spec.ts             # NEW: the regression suite
test/records/unknown-fields.e2e-spec.ts          # "false" text case inverted (now 400)
test/docs/contract-discrepancies.e2e-spec.ts     # D8 removed; header comment updated
specs/005-openapi-contract-export/discrepancies.md # D8 corrected + resolved; D18 proposed
CLAUDE.md                                        # Hardening: bodies are not type-converted
```

**Structure Decision**: This is the existing single-service layout. The validator joins
`src/validators/`, next to `IsDigitalNumber` and `IsLockReference`. The e2e suite joins
`test/records/`, next to the other cross-module request suites (`unknown-fields`,
`record-ids`, `record-fields`).

## Implementation Order (for /speckit-tasks)

1. **Red**: write these and watch them fail on today's code:
   - the `IsDateText` spec;
   - the pipe spec cases (an object, `"abc"` and `7` for typed fields refused);
   - `field-types.e2e-spec.ts`, table-driven per kind × field × value × create/change, with
     nested entries, `null` on change, date formats, the device route, one recovery case, and
     the app payload cases (which pass from the start and must stay green).
2. **Pipe**: bodies without conversion. Re-run the e2e suite. Only the D8 pin and the 010
   `"false"` case may fail. Any other failure is either a test sending the wrong kind (fix it
   and list it in the PR) or an app-relevant regression (stop).
3. **DTOs**: `IsDateText` on the three dates, `IsNumber` on `cost`, `IsString` on lock codes,
   and `skipNullProperties: false` on the six update DTOs.
4. **Contract**: `pnpm build && pnpm docs:check`. Expect "up to date". If it isn't, export,
   review the diff and commit it.
5. **Retire and record**:
   - remove the D8 pin and invert the `"false"` test;
   - correct D8 in the register to the observed scope and mark it resolved, with the
     also-found items (silent conversions, `null` on change, unchecked `cost`, the wrong 400
     claim);
   - add D18 as "recorded only";
   - update the `CLAUDE.md` hardening line and the spec status.
6. **Gates and app**: `VERIFY_E2E=1 pnpm verify`, then the app smoke test (quickstart §3). Then
   the PR to `dev` with `Closes #13`, which must include:
   - the in-place behaviour change (text `"false"`, numbers as lock codes, `null` on change);
   - the device-unverified note (R7);
   - any test fixed in step 2;
   - the e2e result.

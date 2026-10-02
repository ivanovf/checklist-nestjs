# Implementation Plan: Refuse Unknown Fields in Requests

**Branch**: `010-fix-unknown-fields` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-fix-unknown-fields/spec.md` (clarified
2026-10-01). Fixes issues [#10](https://github.com/ivanovf/checklist-nestjs/issues/10) (D5) and
[#20](https://github.com/ivanovf/checklist-nestjs/issues/20) (D15).

## Summary

The global `ValidationPipe` has no `whitelist`, so undeclared body fields reach the services and
Mongoose stores the ones the schema knows: caller-chosen `_id`, `createdAt`, `updatedAt` and
`userLock` (R1). Unknown query parameters are ignored. The obvious fix (`whitelist` +
`forbidNonWhitelisted`) was spiked and rejected. It rebuilds what the services receive, which
would uncheck checklist items on every edit (R2).

The approach, every part of it spiked:

1. **`RequestValidationPipe`**: bodies and queries are validated strictly, and the value is
   passed on **as sent**. Params keep today's rules (R3).
2. **`OwnIdInterceptor`**: on a change, a body `_id` equal to the path id is dropped and a
   different one is refused. On a create, `_id` stays undeclared and is refused. The mobile app
   sends its own `_id` on every edit, so this keeps the app working (R4).
3. **Reservation**: a nested `ReservationItemDto` declares the checklist item `_id` (R5).
   `userLock` is declared (a lock user slot or a lock code id, empty to remove), and the unused
   `lockUser` is deleted. There's no schema change and no migration (R6).
4. **Contract**: the 16 request schemas are closed, change schemas show the optional `_id`, and
   the reservation shows `userLock` (R7).
5. The test app uses the same `applyRequestRules` (R8). The D5 and D15 pins are retired and
   replaced by two e2e suites.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) on Node 24.x

**Primary Dependencies**: NestJS 10 (`ValidationPipe`, `NestInterceptor`), class-validator
(`isMongoId`), class-transformer, Mongoose 8, @nestjs/swagger. **No new dependency.**

**Storage**: MongoDB. No schema, index or data change.

**Testing**: Jest unit tests (`pnpm test`); e2e with `mongodb-memory-server`, `--runInBand`.
Gates via `VERIFY_E2E=1 pnpm verify` (CI is billing-locked).

**Target Platform**: Vercel serverless (Node), plus a local server

**Project Type**: web-service (REST API), consumed by the Flutter app `flutter/reservations`
and the tank-level device

**Performance Goals**: within the existing budgets. Validation already runs on every request;
the interceptor is an in-memory comparison, and there's no new I/O.

**Constraints**:
- Requests with only declared fields and parameters keep their exact outcome and what reaches
  the services (FR-005, R2).
- The mobile app keeps working without a release (SC-004, R10).
- The refusal order is as observed in the data model.
- Sign-in is untouched.
- D3, D6, D8, D9 and D10 are unchanged.

**Scale/Scope**:
- New: 1 pipe, 1 interceptor, 1 validator, 1 nested DTO and 1 OpenAPI helper.
- Changed: `bootstrap.ts` and the test factory; the reservation DTOs, response DTO and service
  (empty `userLock`).
- Tests: 2 new e2e suites plus unit specs.
- Docs: the contract, the register and the pins.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Test-first | ✅ | Seen failing first: the unit specs (pipe, interceptor, `IsLockReference`, OpenAPI helper, the reservation service's empty `userLock`) and the e2e suites, which cover the 15 body operations, own `_id`, queries, precedence, the lock and the app's real payload shapes. Every regression R2 found is pinned. |
| II. Layering | ✅ | Request rules sit at the HTTP edge (pipe and interceptor). Clearing the lock is a service rule. Controllers are unchanged, and there's no `any`. |
| III. Secure by default | ✅ | Closes mass assignment (caller-chosen ids and dates, moving a record to another id). It's central, so new routes inherit it. |
| IV. Validated, documented contracts | ❌ accepted by owner | A global pipe with `whitelist` + `forbidNonWhitelisted` now covers bodies and queries, as the principle requires. The `_id` exception exists only on changes and only for the record's own id, and the contract documents it. The changes are made in place, which deviates from "breaking changes on a new versioned path". The owner decided to treat them as a defect fix (clarification), so the PR states this. The contract is regenerated in the same PR. |
| V. Observability & performance | ✅ | No new queries. |
| Security standards | ✅ | No data migration, so no production access is needed. |
| Workflow | ✅ | Feature branch, PR, `VERIFY_E2E=1 pnpm verify`, e2e result stated. |

**Result**: PASS with one recorded violation. Principle IV requires breaking changes on a new
versioned path, and this feature changes 15 operations in place. The owner accepted this as a
defect fix on 2026-10-01 (spec, Clarifications). Under Governance a reviewer must block a
violating PR, so the PR description must state the violation and that the owner accepted it.

**Re-check after design**: PASS. Params keep their own pipes (`ParseObjectIdPipe`) and aren't
key/value objects, so "unknown fields" doesn't apply to them.

## Project Structure

### Documentation (this feature)

```text
specs/010-fix-unknown-fields/
├── spec.md
├── plan.md
├── research.md             # R1–R10 (spikes and app payloads)
├── data-model.md           # userLock rules, declared fields, API-owned fields, refusal order
├── quickstart.md
├── contracts/
│   └── request-rules.md    # closed schemas, _id on changes, userLock, before → after
├── checklists/
│   └── requirements.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
src/common/pipes/
├── request-validation.pipe.ts        # NEW: strict bodies and queries, value passed on as sent
└── request-validation.pipe.spec.ts   # NEW
src/common/interceptors/
├── own-id.interceptor.ts             # NEW: body _id must equal the :id path param; dropped if equal
└── own-id.interceptor.spec.ts        # NEW
src/validators/
├── lock-reference.validator.ts       # NEW: IsLockReference (user slot | id | empty)
└── lock-reference.validator.spec.ts  # NEW
src/bootstrap.ts                      # applyRequestRules(app), called by configureApp
src/reservations/
├── dto/reservation-item.dto.ts       # NEW: CreateItemDto + optional _id
├── dto/create-reservation.dto.ts     # lockUser → userLock; items: ReservationItemDto
├── dto/reservation-response.dto.ts   # + userLock?
├── reservations.service.ts           # empty userLock → $unset (update) / omitted (create)
└── reservations.service.spec.ts
src/openapi/
├── request-bodies.ts                 # NEW: close request schemas; add _id to change bodies
├── request-bodies.spec.ts            # NEW
└── openapi-document.ts               # applies it
test/security/app-factory.ts          # non-transport branch → applyRequestRules
test/records/unknown-fields.e2e-spec.ts            # NEW
test/reservations/reservation-lock.e2e-spec.ts     # NEW
test/docs/contract-discrepancies.e2e-spec.ts       # D5 and D15 removed
test/docs/contract-completeness.e2e-spec.ts        # closed request schemas ⇔ behaviour; sign-in open
openapi.json                                       # regenerated
specs/005-openapi-contract-export/discrepancies.md # D5 and D15 resolved
```

**Structure Decision**: This is the existing single-service layout. `src/common/interceptors/`
is new, next to `pipes/` and `decorators/`. The validator joins `src/validators/`, next to
`IsDigitalNumber`.

## Implementation Order (for /speckit-tasks)

1. **Red**: write these and watch them fail on today's code (200/201 where 400 is expected):
   - the pipe, interceptor, validator and OpenAPI helper specs;
   - the e2e suites, including an "app payload" case per edited kind, which must stay green
     throughout.
2. **Request rules**: the pipe, the interceptor and `applyRequestRules` (in bootstrap and the
   test factory). Then run the whole e2e suite. An existing test that sends an undeclared
   field is a test bug, and gets fixed and listed.
3. **Reservation**: `ReservationItemDto`, `userLock` with `IsLockReference`, removal of
   `lockUser`, and the empty-lock `$unset`.
4. **Contract**: the helper in `buildOpenApiDocument` and `userLock` in the response DTO, then
   `pnpm docs:export`. Check that the diff covers only §1–3 of the contract file.
5. **Retire** the D5 and D15 pins, update the register, and set the spec status.
6. **Gates and app**: `VERIFY_E2E=1 pnpm verify`, then the manual app check (quickstart #12).
   Then the PR with `Closes #10` and `Closes #20`, which must include:
   - the IV in-place flag;
   - the spec 009 note (R9);
   - the tests fixed in step 2;
   - the e2e result.

## Complexity Tracking

| Deviation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Changes made in place, not on a versioned path (Principle IV) | The owner decided to treat them as a defect fix, like spec 008 (clarification). Both behaviours are recorded discrepancies. | A `/v2` copy of 15 operations for a single client that's already compatible (R10) |
| Two `ValidationPipe`s in one pipe, value passed on as sent | The rebuilt instance resets item `checked`/`comments` and flips `"false"` (R2, observed) | A single strict `ValidationPipe`: the regression R2 shows |
| An interceptor accepting a matching `_id` on changes | The mobile app sends it on every edit, and the owner chose not to change the app (clarification) | Refusing `_id` everywhere would break every app edit. Declaring `_id` in eight DTOs would mean eight opt-ins. |

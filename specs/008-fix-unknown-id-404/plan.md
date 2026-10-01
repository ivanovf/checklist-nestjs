# Implementation Plan: Honest Answers for Unknown and Malformed Record Ids

**Branch**: `008-fix-unknown-id-404` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-fix-unknown-id-404/spec.md`. Fixes issues
[#8](https://github.com/ivanovf/checklist-nestjs/issues/8) (D2) and
[#12](https://github.com/ivanovf/checklist-nestjs/issues/12) (D7).

## Summary

Of the 20 by-id operations, 15 answer an unknown id with a false 200, and 17 answer a
malformed id with a 500. Three of those DELETE routes even say `{ deleted: true }` for a
malformed id. The first cause is unawaited queries: the not-found check tests a Query or
Promise, which is never falsy. The second is an unmapped `CastError`
([R1](research.md#r1--root-cause-of-the-false-successes-d2),
[R2](research.md#r2--root-cause-of-the-server-errors-and-false-deletions-d7)).

The approach:

1. A shared `ParseObjectIdPipe` on every `:id` rejects malformed ids with **400**. It runs
   after the guards (R3).
2. Every service awaits its query and throws **404** when nothing comes back. `remove` reports
   a deletion only when one happened (R4).
3. The account `changePassword` path already answers 404; a test pins it (R5, corrected during implementation).
4. The contract documents 400 and 404 on all 20 operations, the D2 and D7 pins are retired, and
   a new e2e suite covers the 20 operations.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) on Node 24.x

**Primary Dependencies**: NestJS 10, Mongoose 8 (`Types.ObjectId`), @nestjs/swagger. **No new
dependency.**

**Storage**: MongoDB. No schema or index change.

**Testing**: Jest unit tests (`pnpm test`); e2e with `mongodb-memory-server`, `--runInBand`.
Gates via `pnpm verify` (CI is billing-locked; see CLAUDE.md).

**Target Platform**: Vercel serverless (Node), plus a local server

**Project Type**: web-service (REST API)

**Performance Goals**: Unchanged. Awaiting a query the controller already awaited adds no
round trip.

**Constraints**:
- Access rules and their precedence are unchanged (401 → 403 → id 400 → body 400 → 404).
- Answers for existing records are unchanged.
- The neighbouring defects D3, D8, D9 and D10 stay as they are.

**Scale/Scope**:
- 1 new pipe, 7 controllers (20 `@Param` bindings and `@ApiRefusals`), 7 services.
- Unit specs and 1 new e2e suite.
- The contract, the register and `CLAUDE.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Test-first | ✅ | The 20-operation e2e suite and the unit specs (pipe, and each service's `findOne`/`update`/`remove` with a missing record) are written and seen failing first. The definedness-only service specs touched here (items, locks, reservations, config, activity-type, activity) gain real assertions. |
| II. Layering | ✅ | Id format is checked at the HTTP edge (pipe) and existence in the service. The controllers stay HTTP-only, and there's no `any`. |
| III. Secure by default | ✅ | Pipes run after guards, so no id check can leak existence to an unauthorised caller. The unhandled promise rejection on DELETE is removed. |
| IV. Validated, documented contracts | ✅ ⚠️ flagged | Errors become Nest HTTP exceptions with the standard shape, and no raw `CastError` reaches clients: this principle is being satisfied, not bent. The contract is regenerated in the same PR. False 200s become 404s, which is a defect fix (R7), flagged in the PR. |
| V. Performance | ✅ | No new queries. |
| Workflow | ✅ | Feature branch, PR, `VERIFY_E2E=1 pnpm verify`. |

**Result**: PASS. The one flagged item is for the PR description (IV, R7).

**Re-check after design**: PASS, unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/008-fix-unknown-id-404/
├── spec.md
├── plan.md
├── research.md          # R1–R7
├── data-model.md        # id states, answer order, messages
├── quickstart.md
├── contracts/
│   └── by-id-routes.md  # the 20 operations, before → after
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/common/pipes/
├── parse-object-id.pipe.ts          # NEW: 400 `Invalid id "<value>"`
└── parse-object-id.pipe.spec.ts     # NEW
src/{items,locks,reservations,config,activity-type,activity,users}/
├── *.controller.ts                  # @Param('id', ParseObjectIdPipe); @ApiRefusals adds 400, 404
├── *.service.ts                     # await, then 404; remove reports only real deletions
└── *.service.spec.ts                # missing-record tests (definedness-only specs replaced)
test/records/record-ids.e2e-spec.ts  # NEW: the 20 operations × {unknown, malformed} + round trips
test/docs/contract-discrepancies.e2e-spec.ts  # D2 and D7 cases removed; header updated
openapi.json                                   # regenerated
specs/005-openapi-contract-export/discrepancies.md  # D2 and D7 resolved
CLAUDE.md                                      # drop the "by-id routes return 200 empty" warning
```

**Structure Decision**: This is the existing single-service layout. `src/common/pipes/` is new,
next to `decorators/` and `dto/`.

## Implementation Order (for /speckit-tasks)

1. **Red**: the e2e suite for all 20 operations, the pipe spec, and the service specs for
   missing records. Watch them fail: 200 or 500 today.
2. **Pipe** and its bindings on the 20 `@Param`s: the malformed-id 400s go green (US2).
3. **Services**: await and throw 404, with honest deletes, plus `findWithPassword` (R5): the
   unknown-id 404s go green (US1).
4. **Contract**: `@ApiRefusals(400, 404, …)` per operation, then `pnpm docs:export`. Check
   the diff touches only the responses of those 20 operations.
5. **Retire** the D2 and D7 tests. Update the register, `CLAUDE.md` and the spec status.
6. **Gates**: `VERIFY_E2E=1 pnpm verify`. Then the PR with `Closes #8` and `Closes #12`, and
   the R7 change flagged. Check after merge that both issues closed (#7 needed a manual close).

## Complexity Tracking

No violations to justify.

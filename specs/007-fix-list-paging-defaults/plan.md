# Implementation Plan: Optional, Bounded Paging on the Account, Item and Lock Lists

**Branch**: `007-fix-list-paging-defaults` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-fix-list-paging-defaults/spec.md`. Fixes
issue [#7](https://github.com/ivanovf/checklist-nestjs/issues/7) (D1).

## Summary

`GET /api/users/all`, `/api/items/all` and `/api/locks/all` refuse a request that omits
`limit` or `offset`. Running them also showed that `limit=0` returns every record, a negative
`limit` is reinterpreted, there is no maximum, and `offset=-1` is a 500. The cause is
`PaginationQueryDto`: its values are required and have no range ([R1](research.md#r1--root-cause)).
These routes already convert their query, unlike the reservation list in 006.

The approach:

1. Make `PaginationQueryDto` the single paging definition for all four lists: optional, 1–50
   with default 10, and ≥ 0 with default 0.
2. Have `FilterReservationsDto` extend it, and delete `FilterListDto`.
3. Add explicit `@ApiPropertyOptional` so the contract says "optional" (R3).
4. Sort by `_id` in the three services, so pages are stable.
5. Write regression tests first, then regenerate `openapi.json` and retire D1.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) on Node 24.x

**Primary Dependencies**: NestJS 10, class-validator 0.14, class-transformer 0.5.1,
Mongoose 8, @nestjs/swagger with its CLI plugin. **No new dependency.**

**Storage**: MongoDB. No schema or index change, because `_id` is always indexed.

**Testing**: Jest unit tests (`pnpm test`); e2e with `mongodb-memory-server`, `--runInBand`.

**Target Platform**: Vercel serverless (Node), plus a local `start:dev`

**Project Type**: web-service (REST API)

**Performance Goals**: Principle V read p95 < 300 ms. Every list is now bounded to 50 rows,
with an indexed sort.

**Constraints**: The reservation list's behaviour and contract MUST NOT change (docs diff is
empty there). Access rules and response shapes are unchanged. No `whitelist` change (D5).

**Scale/Scope**: One DTO rewritten and one DTO removed, three controllers (comments only),
three services (one line each), unit specs, one e2e suite rewritten, the contract and the
register.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Test-first | ✅ | `pagination-query.e2e-spec.ts` is rewritten to the new status table and stepping-through cases, and seen failing first. New `findAll` unit tests in the three service specs; the DTO spec moves with the DTO. Coverage must not drop. |
| II. Layering | ✅ | Conversion stays in the DTO and pipe, and order in the services. The controllers stay HTTP-only. No `any`. |
| III. Secure by default | ✅ | Roles and guards are unchanged, and accounts are still projected without passwords. |
| IV. Validated, documented contracts | ⚠️ flagged | The query stays DTO-typed. `openapi.json` is regenerated in the same PR. Newly refused values (`limit` 0, negative, > 50) are treated as closing a defect, not a versioned change ([R6](research.md#r6--compatibility-principle-iv)), and the PR must flag them. `offset=-1` goes from 500 to 400, which Principle IV requires (no raw driver errors reach clients). |
| V. Pagination and performance | ✅ | Fixes real violations: `limit=0` was unbounded and there was no hard maximum. The sort on `_id` is indexed by default. |
| Workflow | ✅ | Feature branch, PR, all gates plus `docs:check`. |

**Result**: PASS, with one flagged item for the PR description (IV, R6).

**Re-check after design**: PASS, unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/007-fix-list-paging-defaults/
├── spec.md
├── plan.md              # this file
├── research.md          # observed behaviour, root cause, decisions R1–R6
├── data-model.md        # the paging DTO rules and read order
├── quickstart.md
├── contracts/
│   └── list-paging.md   # before → after for the three routes
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── filter_dto/
│   ├── pagination-query.dto.ts        # the rules: optional, @Type, @IsInt, @Min/@Max, defaults,
│   │                                  #   @ApiPropertyOptional; MAX_PAGE_SIZE lives here
│   ├── pagination-query.dto.spec.ts   # NEW (moved from filter-list.dto.spec.ts)
│   ├── filter-list.dto.ts             # DELETED
│   ├── filter-list.dto.spec.ts        # DELETED (moved)
│   └── filter-reservation.dto.ts      # extends PaginationQueryDto
├── items/   items.controller.ts (comment) · items.service.ts (sort) · items.service.spec.ts (findAll)
├── locks/   locks.controller.ts (comment) · locks.service.ts (sort) · locks.service.spec.ts (findAll)
├── users/   users.controller.ts (comment) · users.service.ts (sort) · users.service.spec.ts (findAll)
└── reservations/reservations.controller.ts  # MAX_PAGE_SIZE import path; correct the Swagger comment

test/docs/
├── pagination-query.e2e-spec.ts       # rewritten: new status table + stepping through pages, 3 routes
└── contract-discrepancies.e2e-spec.ts # D1 case removed; header "Not here" list updated

openapi.json                                       # regenerated; changes only the 3 routes
specs/005-openapi-contract-export/discrepancies.md # D1 resolved; the extra defects recorded
```

**Structure Decision**: This is the existing single-service layout. The regression suite
reuses `test/docs/pagination-query.e2e-spec.ts`, because that file already pins exactly these
three routes' paging.

## Implementation Order (for /speckit-tasks)

1. **Red**:
   - Rewrite `pagination-query.e2e-spec.ts` for the new behaviour: status table, stepping
     through pages, order.
   - Move the DTO spec to `pagination-query.dto.spec.ts` and import from there.
   - Add service `findAll` sort tests.
   - Check that each test fails for the observed reason.
2. **DTO**:
   - Move the rules and `MAX_PAGE_SIZE` into `PaginationQueryDto`, and add
     `@ApiPropertyOptional`.
   - Have `FilterReservationsDto` extend it, and delete `FilterListDto`.
   - Fix the imports in the reservations controller.
3. **Services**: `.sort({ _id: 1 })` in the three services.
4. **Controllers**: update the D4/D1 comments in the three controllers, and correct the
   Swagger comment in the reservations controller.
5. **Green**: run the unit tests, all of e2e (including 006's suite) and the D1 removal.
6. **Contract**: `pnpm docs:export`. The diff must touch only the three routes. Then
   `pnpm docs:check`.
7. **Register**: mark D1 resolved and record the unbounded `limit=0`, the negative `limit`,
   the missing maximum and the `offset=-1` 500.
8. **Gates** (all five plus `docs:check`), then the PR with `Closes #7` and the R6 changes
   flagged.

## Complexity Tracking

No violations to justify.

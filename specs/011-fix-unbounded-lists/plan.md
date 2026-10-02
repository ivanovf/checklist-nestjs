# Implementation Plan: Bounded Paging on the Activity, Activity Type and Configuration Lists

**Branch**: `011-fix-unbounded-lists` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-fix-unbounded-lists/spec.md`. Fixes issue
[#11](https://github.com/ivanovf/checklist-nestjs/issues/11) (D6).

## Summary

`GET /api/activity`, `/api/activity-type` and `/api/config` return their whole collection.
Running them showed that `limit` and `offset` are silently ignored, and that activities sharing
a date have no fixed order ([research](research.md#observed-behaviour-2026-10-01)). Activity
types and configurations take no query at all. Activities take one, but the handler receives
the raw query, so a DTO default would never reach it (R1, the same trap as D11).

The approach:

1. Bind `PaginationQueryDto` on the activity type and configuration lists, and make
   `FilterActivityDto` extend it. That gives one set of rules for all seven lists (R2).
2. Use the route-scoped `ValidationPipe({ transform: true, whitelist: true })` on all three,
   so handlers receive converted, defaulted values (R3).
3. Have the services apply `limit`/`offset` with a total order: activities by
   `{ date: -1, _id: -1 }`, the others by `{ _id: 1 }` (R4).
4. Index every activity sort and filter field (R5).
5. Write the regression tests first, then regenerate `openapi.json`, retire D6 and close #11.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) on Node 24.x

**Primary Dependencies**: NestJS 10, class-validator 0.14, class-transformer 0.5.1,
Mongoose 8, @nestjs/swagger with its CLI plugin. **No new dependency.**

**Storage**: MongoDB. Four new indexes on `activities`. No field changes.

**Testing**: Jest unit tests (`pnpm test`); e2e with `mongodb-memory-server`, `--runInBand`.

**Target Platform**: Vercel serverless (Node), plus a local `start:dev`

**Project Type**: web-service (REST API)

**Performance Goals**: Principle V read p95 < 300 ms. Every list is now capped at 50 rows,
read in an indexed order.

**Constraints**:
- Access rules and response shapes are unchanged, and the activity filters keep working.
- The other four lists' contracts MUST NOT change: the docs diff touches only the three
  operations.
- No global pipe change (D5 is out of scope).

**Scale/Scope**: three controllers, three services, one DTO, one schema, unit specs, one e2e
suite extended and one new, the contract and the register.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Test-first | ✅ | E2e regression tests are written first and seen failing (they get 60 records where they expect 10, and 200 where they expect 400). New `findAll` unit tests in the three service specs, controller tests for the bound query, and an activity schema index spec. The D6 pin is removed in the same change. |
| II. Layering | ✅ | Conversion lives in the DTO and route pipe, and order and paging in the services. The controllers stay HTTP-only. `query: any` in `ActivityService.findAll` becomes `FilterQuery<Activity>`. |
| III. Secure by default | ✅ | Roles and guards are unchanged. Permission is still checked before the query is validated (observed 403 first). |
| IV. Validated, documented contracts | ⚠️ flagged | Every list query is DTO-typed, and two routes gain one. `openapi.json` is regenerated in the same PR. Values that used to be ignored are now refused, and large lists now return one page. This is treated as closing a defect, not a versioned change ([R7](research.md#r7--compatibility-principle-iv)). The PR must flag it, including the Flutter app's possible reliance on whole lists. |
| V. Pagination and performance | ✅ | This fixes the last unbounded lists, and every activity sort and filter field is now indexed (R5). That also corrects an existing violation in the area being touched. |
| Workflow | ✅ | Feature branch, PR, `pnpm verify`, plus `VERIFY_E2E=1` with the e2e result stated in the PR. |

**Result**: PASS, with one flagged item for the PR description (IV, R7).

**Re-check after design**: PASS, unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/011-fix-unbounded-lists/
├── spec.md
├── plan.md              # this file
├── research.md          # observed behaviour, root causes, decisions R1–R8
├── data-model.md        # queries, read order, activity indexes
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
├── activity/
│   ├── dto/filter-activity.dto.ts           # extends PaginationQueryDto
│   ├── activity.controller.ts               # route pipe on @Query; response description
│   ├── activity.controller.spec.ts          # passes the DTO through
│   ├── activity.service.ts                  # FilterQuery<Activity>; sort {date:-1,_id:-1}; limit/skip
│   ├── activity.service.spec.ts             # findAll: filters, order, paging
│   └── entities/
│       ├── activity.entity.ts               # 4 indexes
│       └── activity.entity.spec.ts          # NEW: asserts the indexes
├── activity-type/
│   ├── activity-type.controller.ts          # @Query PaginationQueryDto; @ApiRefusals(400, 401, 403)
│   ├── activity-type.controller.spec.ts
│   ├── activity-type.service.ts             # findAll(limit, offset): sort {_id:1}
│   └── activity-type.service.spec.ts
└── config/
    ├── config.controller.ts                 # @Query PaginationQueryDto; @ApiRefusals(400, 401)
    ├── config.controller.spec.ts
    ├── config.service.ts                    # findAll(limit, offset): sort {_id:1}; dead check removed
    └── config.service.spec.ts

test/
├── docs/pagination-query.e2e-spec.ts        # ROUTES += activity-type, config (same table, oldest first)
├── docs/contract-discrepancies.e2e-spec.ts  # D6 case removed; header "Not here" updated
└── activity/activity-paging.e2e-spec.ts     # NEW: date order + ties, filters with paging, refusals

openapi.json                                       # regenerated; only the three operations
specs/005-openapi-contract-export/discrepancies.md # D6 resolved; the two findings recorded
```

**Structure Decision**: This is the existing single-service layout.
- Activity types and configurations behave exactly like items and locks (id order, no
  filters), so they join `pagination-query.e2e-spec.ts`.
- Activities differ in order and filters, so they get their own suite, as reservations did in
  006.

## Implementation Order (for /speckit-tasks)

1. **Red**:
   - Extend `pagination-query.e2e-spec.ts` and write `activity-paging.e2e-spec.ts`.
   - Add the service `findAll` unit tests and the activity schema index spec.
   - Check each test fails for the observed reason: whole collection, ignored values, or
     unordered ties.
2. **DTO**: `FilterActivityDto extends PaginationQueryDto`.
3. **Controllers**:
   - Add the route pipes and bind the queries.
   - Pass `limit`/`offset` to the services.
   - Add `@ApiRefusals` 400 on activity types and configurations.
   - Update the response descriptions.
4. **Services**: the sorts plus `limit`/`skip`. Replace `any`. Remove the dead config check.
5. **Schema**: the activity indexes.
6. **Green**: unit tests, then all of e2e (including the 006, 007 and 008 suites). Remove the
   D6 pin. Run the `price=0` check from R8 and record the result.
7. **Contract**: `pnpm docs:export`. The diff must touch only the three operations. Then
   `pnpm docs:check`.
8. **Register**: mark D6 resolved and record the ignored paging values and the unordered
   same-date activities as fixed (R8 turned out to be a regression of this change and was fixed here; see research).
9. **Gates**: `VERIFY_E2E=1 pnpm verify`, then the PR with `Closes #11`, the R7 effects
   flagged and the e2e result stated.

## Complexity Tracking

No violations to justify.

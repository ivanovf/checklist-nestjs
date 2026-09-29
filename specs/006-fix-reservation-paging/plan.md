# Implementation Plan: Usable Paging on the Reservation List

**Branch**: `006-fix-reservation-paging` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-fix-reservation-paging/spec.md`. Fixes
issue [#16](https://github.com/ivanovf/checklist-nestjs/issues/16) (D11).

## Summary

`GET /api/reservations/all` refuses every `limit`/`offset` value. The same root cause also
leaves the list unbounded when those values are omitted, makes the default order ascending
although the contract says `desc`, and makes `old=false` filter like `old=true`. The
cause, observed by running the app: the global `ValidationPipe` validates a converted copy of
the query but hands the handler the **raw** query (no `transform: true`), and `limit`/`offset`
have no runtime type to convert to ([research R1](research.md#r1--root-cause)).

The approach:

1. A route-scoped transforming `ValidationPipe` on this one `@Query()`.
2. `limit`/`offset` typed with `@Type(() => Number)`, integer rules, and a **maximum of 50**.
3. Boolean flags read from the raw value, so they survive implicit conversion.
4. A stable `{ dateIni, _id }` sort, backed by a new index.
5. Regression tests, then a regenerated `openapi.json`, with the D11 register entry and
   test retired.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) on Node 24.x

**Primary Dependencies**: NestJS 10 (Express), class-validator 0.14, class-transformer
0.5.1, Mongoose 8, @nestjs/swagger. **No new dependency.**

**Storage**: MongoDB (Atlas in production, `mongodb-memory-server` in e2e). One new
compound index on `reservations`.

**Testing**: Jest with ts-jest. Unit tests (`pnpm test`) and e2e tests (`pnpm test:e2e`,
`--runInBand`, one shared mongod).

**Target Platform**: Vercel serverless (Node), plus a local `start:dev`

**Project Type**: web-service (REST API)

**Performance Goals**: Principle V budget: read p95 < 300 ms. Bounding the list to ≤ 50
rows with an indexed sort only improves on today's unbounded read.

**Constraints**: Only one route's behaviour changes. The route pipe adds `whitelist: true` (strip only). `PaginationQueryDto` and the items,
locks and users lists stay as they are (issues #7 and #11 are out of scope). The error body
shape is unchanged.

**Scale/Scope**: One controller method, two DTO files, one service method, one schema
index, a new e2e suite, and updated contract and register files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Test-first | ✅ | The regression e2e suite and the DTO/service unit tests are written and seen failing before the fix. `findAll` gains its first service unit tests. Coverage floors are held. |
| II. Layering | ✅ | Conversion stays at the HTTP edge (pipe and DTO). The service keeps the query logic. The response shape is unchanged. The service's existing `filter: any` is on a line this change does not modify. Replacing it with a typed `FilterQuery<Reservation>` is a cheap improvement and is included, because the method is being edited. |
| III. Secure by default | ✅ | Roles and guards are unchanged. No secrets. `pnpm audit` gate. |
| IV. Validated, documented contracts | ⚠️ flagged | The query stays fully DTO-typed. `openapi.json` is regenerated in the same PR. Behaviour moves **to** the contract that is already published (default `desc`, default 10), so no versioned path is added ([R7](research.md#r7--is-this-a-breaking-change-principle-iv)). The PR must flag the observable changes for the reviewer. `whitelist`/`forbidNonWhitelisted` (D5) are still off globally. The route pipe copies the global options rather than fixing D5 for this one route, so behaviour stays consistent across routes. |
| V. Performance and pagination | ✅ | Fixes a real violation: the list was unbounded. Default 10, hard maximum 50, and the new sort is indexed. |
| Workflow | ✅ | On the feature branch, merged by PR, with all five gates plus `docs:check`. |

**Result**: PASS. There is one flagged item for the PR description (IV, R7). None is
unjustified.

**Re-check after design**: PASS, unchanged. The design adds no new layer, dependency or
route.

## Project Structure

### Documentation (this feature)

```text
specs/006-fix-reservation-paging/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0: observed behaviour, root cause, decisions R1–R7
├── data-model.md        # Phase 1: query DTO rules, sort order, index
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   └── reservation-list.md   # Phase 1: before → after for GET /api/reservations/all
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── filter_dto/
│   ├── filter-list.dto.ts            # limit/offset: @Type(Number), @IsInt, @Min, @Max(50), typed defaults
│   ├── filter-list.dto.spec.ts       # NEW: conversion, defaults, bounds
│   ├── filter-reservation.dto.ts     # old/validated: raw-value @Transform
│   └── filter-reservation.dto.spec.ts# NEW: booleans under implicit conversion, sort default
├── reservations/
│   ├── reservations.controller.ts    # route-scoped transforming ValidationPipe; @ApiQuery text
│   ├── reservations.controller.spec.ts # the pipe is bound to findAll's query
│   ├── reservations.service.ts       # sort { dateIni, _id }; typed filter
│   ├── reservations.service.spec.ts  # NEW findAll tests: limit/skip/sort/filter
│   └── entities/reservation.entity.ts# indexes: { dateIni: -1, _id: -1 }, type, validated, dateEnd

test/
├── reservations/
│   └── reservation-paging.e2e-spec.ts   # NEW regression suite (US1–US3, SC-001…SC-004)
└── docs/
    └── contract-discrepancies.e2e-spec.ts  # remove the D11 test; header note updated

openapi.json                                           # regenerated (pnpm docs:export)
specs/005-openapi-contract-export/discrepancies.md     # D11 → resolved by 006; corrected claim; sort/old noted
```

**Structure Decision**: This is the existing single NestJS service layout. The new e2e suite
goes in `test/reservations/`, next to `test/docs/` and `test/security/`.

## Implementation Order (for /speckit-tasks)

1. **Red**: write the e2e suite `test/reservations/reservation-paging.e2e-spec.ts` and the
   unit tests. Confirm they fail for the observed reasons.
2. **DTOs**: fix `limit`/`offset` typing and bounds, and the boolean transforms (R3, R4).
3. **Controller**: add the route-scoped `ValidationPipe({ transform: true,
   transformOptions: { enableImplicitConversion: true } })` (R2), and update the
   `@ApiQuery` descriptions (min, max, default; drop the "refused, omit it" text).
4. **Service and schema**: stable sort (R5), typed filter, index (R6).
5. **Green**: the unit and e2e suites pass. Remove the D11 case from
   `contract-discrepancies.e2e-spec.ts`.
6. **Contract**: `pnpm docs:export`, then commit `openapi.json`. `pnpm docs:check` must be
   clean.
7. **Register**: mark D11 resolved with a link to 006. Correct "the default still applies".
   Record the sort default and `old=false` defects as found and fixed here.
8. **Gates**: `pnpm lint:ci && pnpm test && pnpm test:e2e && pnpm build && pnpm docs:check
   && pnpm audit --audit-level high`.
9. **PR**: `Closes #16`. Name Principles IV and V and flag the R7 behaviour changes.

## Complexity Tracking

| Item | Why it's accepted | Simpler alternative rejected because |
|---|---|---|
| Route-scoped pipe instead of global `transform: true` | Limits the behaviour change to the one route in scope | Global `transform` changes every handler's input across the whole API (R2) |

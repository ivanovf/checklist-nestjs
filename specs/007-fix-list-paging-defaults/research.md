# Research: Optional, Bounded Paging on the Account, Item and Lock Lists

**Feature**: `specs/007-fix-list-paging-defaults` | **Date**: 2026-09-29

Everything below was observed by running the real app: the e2e harness, in-memory Mongo,
`configureApp`, and 15 seeded items. The probe was discarded afterwards; the regression tests
replace it. We did not rely on reading the source (`CLAUDE.md`).

## Observed behaviour (2026-09-29), identical on all three lists

| Query | Status | Result |
|---|---|---|
| *(none)* | 400 | `limit must be an integer number`, `offset must be an integer number` |
| `limit=10` | 400 | `offset must be an integer number` |
| `offset=0` | 400 | `limit must be an integer number` |
| `limit=10&offset=0` | 200 | 10 of 15 |
| `limit=5&offset=5` | 200 | 5 |
| `limit=0&offset=0` | 200 | **all 15**: MongoDB treats a limit of 0 as no limit |
| `limit=-1&offset=0` / `limit=-5&offset=0` | 200 | 1 / 5: a negative limit means "one batch of \|n\|" |
| `limit=1000&offset=0` | 200 | all 15: no maximum |
| `limit=10&offset=-1` | **500** | the driver rejects a negative skip, which surfaces as a server error |

## R1 — Root cause

**Finding**: Unlike the reservation list (006), these routes already convert their query.
Each binds `@Query(new ValidationPipe({ transform: true })) query: PaginationQueryDto`, so the
handler receives numbers. The defect is in `PaginationQueryDto` itself:

- Both properties are required (`@IsInt()` with no `@IsOptional()`) and have no defaults. The
  class comment says this was left deliberately for a later feature: it kept D4's behaviour
  unchanged. **This is D1.**
- There are no range rules, so `0`, negative values and very large values all reach the
  driver.

## R2 — One paging definition for every list

**Decision**: `PaginationQueryDto` becomes the single definition of paging:
`@IsOptional() @Type(() => Number) @IsInt()`, with `@Min(1) @Max(MAX_PAGE_SIZE)` on `limit`
(default 10) and `@Min(0)` on `offset` (default 0). `FilterReservationsDto` extends it, and
`FilterListDto` (006) is deleted. `MAX_PAGE_SIZE = 50` moves with the rules, and
`filter-list.dto.spec.ts` becomes `pagination-query.dto.spec.ts`.

**Rationale**: FR-005 requires identical rules, defaults and messages on all four lists. Two
classes with the same decorators would drift. The name `PaginationQueryDto` says what the
class is, which `FilterListDto` does not.

**Alternatives considered**:
- *`PaginationQueryDto extends FilterListDto {}`*: rejected. An empty subclass exists only to
  keep a name, and it leaves two names for one concept.
- *Copy the 006 decorators into `PaginationQueryDto`*: rejected, because the copies would
  drift apart (FR-005).

## R3 — The contract must say "optional"

**Finding** (observed with a trial build of `PaginationQueryDto extends FilterListDto`, then
reverted): the `@nestjs/swagger` CLI plugin **does** document inherited query properties,
including `minimum`, `maximum` and `default`, from the class-validator decorators and the
initialiser. That contradicts the comment in `reservations.controller.ts`. But it marks both
properties `required: true`, because they are declared without `?`, and it types them as
`number` rather than `integer`.

**Decision**: Decorate both properties with `@ApiPropertyOptional({ type: 'integer',
minimum, maximum, default, description })`. Keep the TypeScript types non-optional
(`limit: number = 10`): the defaults guarantee a value, and the services take `number`.

**Rationale**: This is the smallest way to make the contract match the behaviour (FR-007),
and every list inherits it.

**Reservations**: its hand-written `@ApiQuery` blocks stay. They already produce the right
output, and removing them is not needed for #7. The misleading comment beside them is
corrected. `pnpm docs:export` must show **no change** under `/api/reservations/all`, which
proves the move of the rules changed nothing there.

## R4 — Route pipes

**Decision**: Keep the existing route-scoped `ValidationPipe({ transform: true })` on each of
the three routes, and update its comment (D1 resolved). `@Type(() => Number)` converts
without implicit conversion, and the global pipe validates first with the same rules. Add
`whitelist: true` to match the reservation list (analysis I1). It only strips undeclared keys,
which the services never read, so callers see no change. `forbidNonWhitelisted` stays out,
because it belongs to D5 / #10.

## R5 — Stable order

**Finding**: The three services call `find().limit().skip()` with **no sort**. MongoDB
returns natural order, which is not guaranteed to stay the same across queries, so paging can
repeat or skip records.

**Decision**: `.sort({ _id: 1 })` in `ItemsService`, `LocksService` and `UsersService`
`findAll`: oldest first, the order the lists appear to return today (spec Assumptions).

**Rationale**: `_id` is unique, always present and always indexed, so Principle V is met with
no new index. These lists have no filters, so no other field needs an index.

## R6 — Compatibility (Principle IV)

**Finding**: The contract today documents both values as **required**, `number`, with no
range. After the change they are optional with defaults, and the range narrows. Requests that
succeed today and will now be refused: `limit` of 0, negative, or above 50. Before, those
requests were unbounded, silently reinterpreted, or beyond the constitution's hard maximum.

**Decision**: As in 006, treat this as closing a defect, not as a versioned contract change.
Principle V requires a hard maximum on *every* list, and a new versioned path would be bound
by it too. So Principle IV's versioned-path route can't keep `limit=1000` working, and
refusing it is the only way to meet both principles (analysis C1).
The PR flags the newly refused values for the reviewer. `offset=-1` goes from 500 to 400, a
pure fix.

# Research: Usable Paging on the Reservation List

**Feature**: `specs/006-fix-reservation-paging` | **Date**: 2026-09-29

Every finding below was **observed by running the real app**: the e2e harness, in-memory
Mongo, and `configureApp`. We seeded 25 reservations, 5 per start date. The probes were
thrown away afterwards; the regression tests in this plan replace them. We did not rely on
reading the source, as `CLAUDE.md` requires.

## Observed behaviour (2026-09-29)

| Request to `GET /api/reservations/all` | Status | Result |
|---|---|---|
| *(no query)* | 200 | **all 25** rows, **ascending** |
| `sort=asc` | 200 | 25 rows, ascending |
| `sort=desc` | 200 | 25 rows, descending |
| `limit=5` | 400 | `limit must be a positive number`, `…conforming to the specified constraints` |
| `offset=0` | 400 | `offset must not be less than 0`, `…` |
| `limit=5&offset=0` | 400 | all four messages above |
| `type=direct` | 200 | 20 rows, correctly filtered |
| `old=true` / `old=false` | 200 / 200 | **the same 10 rows** for both |
| `validated=true` | 200 | 0 rows (correct for the fixture) |

The service's `findAll` received a plain `Object` (`{}`, `{ sort: 'asc' }`,
`{ type: 'direct' }`), not a `FilterReservationsDto`, and no defaults were set on it.

## R1 — Root cause

**Finding**: The global `ValidationPipe` (`src/bootstrap.ts`) is configured with
`transformOptions.enableImplicitConversion` but **without `transform: true`**. The pipe
converts the query into a DTO instance only to validate it, and then passes the **raw
query** to the handler. That has three effects:

1. `limit` and `offset` have no type annotation (`limit = 10`), so TypeScript emits
   `design:type` as `Object` (observed) and implicit conversion does nothing. The validator
   then sees the strings `"5"` and `"0"`, and `@IsNumber`/`@IsPositive`/`@Min` refuse them.
   **This is D11.**
2. The handler never sees the DTO's defaults (`limit = 10`, `offset = 0`, `sort = 'desc'`).
   Mongoose treats `limit(undefined)` as no limit, and `sort === 'desc' ? -1 : 1` falls
   through to ascending. **The list is unbounded, and the default order is the opposite of
   what the contract documents.** The D11 register entry claims "the default still
   applies". That is wrong.
3. `old` reaches the service as the string `"false"`, which is truthy, so it filters exactly
   like `old=true`.

## R2 — Where to switch conversion on

**Decision**: A route-scoped `ValidationPipe({ transform: true, transformOptions: {
enableImplicitConversion: true } })` on the `@Query()` parameter of
`ReservationsController.findAll`.

**Rationale**: The global pipe still validates first, with identical rules, so refusals and
their messages don't change. The route pipe then receives the same raw query and hands the
handler a converted, defaulted `FilterReservationsDto`. The blast radius is exactly this one
route, which is what the spec's scope allows (issues #7 and #11 are left alone).

**Alternatives considered**:
- *Global `transform: true`*: rejected. It changes what **every** body and query handler
  receives: class instances, applied defaults and converted types across items, locks,
  users, activities and config. That behaviour change spans the whole API and belongs to
  its own feature (it overlaps D1/D5).
- *Convert and apply defaults inside the service*: rejected. HTTP parsing would move into
  the service layer (Principle II), and the DTO's declared defaults would be duplicated.
- *Per-value `ParseIntPipe`*: rejected. D4 removed that pattern deliberately in favour of a
  typed query DTO.

## R3 — Converting `limit` and `offset`

**Decision**: `@Type(() => Number)`, `@IsInt()`, `@Min(1)`/`@Min(0)`, `@Max(50)` on `limit`,
`@IsOptional()`, with explicit `number` annotations and the same defaults.

**Rationale**: `@Type` converts regardless of `design:type`, as `PaginationQueryDto` already
does for D4. Observed edge results, all refusals are 400: `2.5` → 2.5 (not an int), `abc` →
NaN, `limit=5&limit=7` → an array → NaN. `limit=` (empty) → 0 → below the minimum, refused.
`offset=` (empty) → 0 → accepted, which is harmless.

## R4 — The boolean filters break once conversion is on

**Finding** (observed with class-transformer 0.5.1): with `enableImplicitConversion`, a
property whose `design:type` is `Boolean` is converted **before** `@Transform` runs. So
`@Transform(({ value }) => value === 'true')` sees `true` or `false` rather than `'true'`,
and **always yields `false`**:

| Input | Implicit conversion **on** | Implicit conversion **off** |
|---|---|---|
| `validated=true&old=false` | `validated: false`, `old: false` ✗ | `true`, `false` ✓ |
| `validated=false&old=true` | `false`, `false` ✗ | `false`, `true` ✓ |

Today this is invisible, because the converted copy is only validated and then thrown away.
Switching conversion on without fixing it would make `validated=true` and `old=true` silently
mean `false`.

**Decision**: Read the raw value from the source object: `@Transform(({ obj, key }) =>
…)`. Map `'true'` to `true` and `'false'` to `false`, and pass anything else through
unchanged so that `@IsBoolean` refuses it with 400.

**Rationale**: This works whether implicit conversion is on or off, and it adds no new
dependency.

**Consequence**: `old=yes` or `validated=1` are accepted today and treated
inconsistently. After the change they are refused with 400. This is documented in the
contract.

## R5 — Stable order across pages

**Finding**: The sort key is `dateIni` alone, and ties are normal (5 per date in the probe).
MongoDB does not guarantee a consistent order for documents with equal sort keys, so
`skip`/`limit` can repeat or skip them across pages. That would break SC-002.

**Decision**: Sort by `{ dateIni: dir, _id: dir }`.

**Rationale**: `_id` is unique and always present, and MongoDB's own guidance for paging
with `skip`/`limit` is to add a unique tie-break field. The only visible change is a fixed
order among reservations that share a start date. Before, that order was arbitrary.

## R6 — Index for the sort

**Decision**: Add a compound schema index `{ dateIni: -1, _id: -1 }` to `ReservationSchema`
(one index serves both sort directions), plus single-field indexes on the filter fields
`type`, `validated` and `dateEnd`.

**Rationale**: Principle V requires every sort field to be indexed, and the new index ships
with the query change. There is no index on the collection today. The filter fields were first
left for a follow-up. `/speckit-analyze` (C1) pointed out that this change edits that very
query, and governance says a defect is fixed when its area is next touched, so they are
indexed here too.

**Alternatives considered**: No index. Rejected, because it contradicts Principle V for a
field this change touches.

## R7 — Is this a breaking change? (Principle IV)

**Finding**: The published contract (`openapi.json`, 005) already documents `sort` default
`desc` and `limit` default 10. The running API disagrees with it. After the change the
API matches the contract as published. The only difference in the contract is that
`limit`/`offset` are no longer marked "refused, omit it", and `old`/`validated` refuse values
other than `true`/`false`.

**Decision**: Treat this as a defect fix that brings the API into line with its published
contract, not as a contract change. Do not introduce a versioned path. The PR must **flag this
for the reviewer**, because clients that relied on the undocumented behaviour will see it
change:

- A request without `limit` now returns at most 10 rows instead of all of them.
- A request without `sort` now returns newest first instead of oldest first.
- `old=false` no longer filters to past stays.

The Flutter app is the main caller. The whole-query scope was chosen on 2026-09-29 with the
order change known (spec Clarifications).

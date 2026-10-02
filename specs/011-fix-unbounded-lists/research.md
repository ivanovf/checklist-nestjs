# Research: Bounded Paging on the Activity, Activity Type and Configuration Lists

**Feature**: `specs/011-fix-unbounded-lists` | **Date**: 2026-10-01

The behaviour below was observed by running the real app: the e2e harness, in-memory Mongo,
`configureApp`, and 60 seeded records of each kind (activities spread over 5 dates). The probe
was discarded afterwards, and the regression tests replace it. We did not rely on reading the
source (`CLAUDE.md`).

## Observed behaviour (2026-10-01)

Same on all three lists, and the same for an administrator and a standard account wherever
the route admits both:

| Query | Status | Result |
|---|---|---|
| *(none)* | 200 | **all 60** |
| `limit=5`, `limit=5&offset=10` | 200 | all 60: ignored |
| `limit=0`, `limit=1000`, `limit=abc`, `offset=-1` | 200 | all 60: ignored, never refused |
| `foo=bar` | 200 | all 60 |
| *(no token)* | 401 | |

Activity list only:

| Query | Status | Result |
|---|---|---|
| `price=1` | 200 | 30, the filter works |
| `status=bogus` | 400 | `status must be one of the following values: COMPLETED, TODO` |
| `type=abc` | 400 | `type must be a mongodb id` |
| order | | date descending. The 12 activities sharing the newest date came back in **no id order** (`…54f, 51d, 531, 513…`) |

Activity type list: a standard account gets **403** whatever the query, so permission is
checked before any query value. Activity types and configurations come back in insertion
order.

## R1 — Root causes

1. **Activity types and configurations** take no query at all. `findAll()` calls `find()` with
   no limit and no sort. Every query value is ignored because nothing reads it.
2. **Activities** bind `@Query() FilterActivityDto`, which declares only the three filters.
   The global `ValidationPipe` has no `transform: true`, so the handler receives the **raw
   query**. Feature 006 established this by running it (006 research R1): a DTO default never
   reaches the handler, and `limit(undefined)` means no limit. Simply adding paging fields to
   `FilterActivityDto` would leave the list unbounded, and the bug would look fixed in the
   source. Also, the sort is `{ date: -1 }` with no tie-break.

## R2 — One paging definition

**Decision**: Reuse `PaginationQueryDto` (`src/filter_dto/pagination-query.dto.ts`):
optional `limit` 1–50 with default 10, and optional `offset` ≥ 0 with default 0, the same
`@ApiPropertyOptional` metadata and `MAX_PAGE_SIZE`.
- Activity types and configurations bind `PaginationQueryDto` directly.
- `FilterActivityDto extends PaginationQueryDto`, as `FilterReservationsDto` does.

**Rationale**: FR-004 requires the same rules, defaults and messages as the four lists that
are already fixed. 007 R2 rejected copying decorators because the copies drift. Edge results
are inherited and already proven there: `limit=5&limit=7` → array → NaN → 400, `limit=` → 0 →
400, `offset=` → 0 → accepted.

**Alternatives considered**: a separate DTO per list, rejected (drift, FR-004). Clarified
2026-10-01: a larger default for the two small lists, rejected.

## R3 — Where conversion happens

**Decision**: On all three routes, use the route-scoped pipe the other lists use:
`@Query(new ValidationPipe({ transform: true, whitelist: true }))`.

**Rationale**:
- It makes the handler receive a converted DTO instance with its defaults, which fixes R1.2
  and gives activity types and configurations a typed query.
- The global pipe still validates first, with identical rules and messages.
- `whitelist: true` strips undeclared keys, which no service reads, so callers see no change
  (007 R4). `forbidNonWhitelisted` stays out because it is D5 / #10.

**Activity filters under conversion**: `price` has `design:type` `Number`, and `@IsNumber`
becomes a real number. `type` and `status` are strings. There is no boolean property, so the
006 R4 trap (implicit conversion before `@Transform`) does not apply. The tests still prove
each filter with paging.

**Alternative rejected**: global `transform: true`, which would change what every handler
receives (006 R2).

## R4 — Fixed order

**Decision**:
- **Activities**: `.sort({ date: -1, _id: -1 })`. Newest first stays the order. Among
  activities with the same date, the newest created comes first.
- **Activity types and configurations**: `.sort({ _id: 1 })`. Oldest first, which is the
  insertion order observed today and the same as items, locks and accounts (007 R5).

**Rationale**: `_id` is unique, so the order is total and pages cannot overlap (FR-005). Both
choices keep today's first record first, so the mobile app's view does not change for small
collections.

## R5 — Indexes (Principle V)

**Finding**: `ActivitySchema` declares no index, although the list sorts on `date` and
filters on `type`, `status` and `price`. The constitution's governance treats this as a known
defect, to be corrected when the area is next touched, which this feature does.

**Decision**: Mirror the reservation schema (006 R6):
`ActivitySchema.index({ date: -1, _id: -1 })` for the sort, plus `{ type: 1 }`,
`{ status: 1 }` and `{ price: 1 }`. A schema spec asserts them, as
`reservation.entity.spec.ts` does. Activity types and configurations sort on `_id` only, so
they need no new index.

**Rationale**: Principle V says every filter and sort field MUST be indexed. Mongoose builds
the indexes at connection time (`autoIndex` is not disabled anywhere). The collections are
small, so the write cost is negligible.

**Alternative considered**: compound `{ <filter>: 1, date: -1, _id: -1 }` indexes, which
serve filter and sort together. Rejected for now: single-field indexes match the reservation
precedent and meet the rule. At chalet scale, a 50-row page is far inside the 300 ms budget
either way.

## R6 — Response statuses and contract

- `GET /api/activity-type` and `GET /api/config` newly document **400**, because an invalid
  paging value is now refused. `GET /api/activity` already documents 400 for its filters.
- The "unpaginated (discrepancy D6)" descriptions are replaced by the order and page size.
- `openapi.json` is regenerated. The diff must touch only these three operations (the
  `limit`/`offset` parameters, the 400 response and the descriptions). Access refusals are
  unchanged, so check 3 against the authorization matrix still holds.
- The dead `if (!conf) throw NotFoundException` in `ConfigService.findAll` is removed. It
  tested an unawaited query, which is always truthy (the D2 pattern), so it never ran, and
  removing it changes no behaviour. An empty collection answers `[]`, as today.
- `query: any` in `ActivityService.findAll` is replaced by `FilterQuery<Activity>`, because
  Principle II forbids `any` in modified code.

## R7 — Compatibility (Principle IV)

Requests that succeed today and will be refused: any invalid `limit` or `offset` on the three
lists, because those values used to be ignored. Requests that will now return less: any
request on a list with more than 10 records (or more than `limit`). As in 006 and 007, this is
treated as closing a defect, not as a versioned change. The contract never offered paging on
these lists, and Principle V forbids an unbounded list on any path, versioned or not. The PR
flags both effects, and the Flutter app's possible reliance on whole lists (spec Assumptions).

## R8 — The `price=0` filter (resolved during implementation)

**Planned as**: suspected pre-existing defect, read from `if (filter.price)`.

**Observed** (2026-10-01): it was **not** a pre-existing defect. Before this change, the handler
received the raw string `'0'`, which is truthy, so the filter applied. Two things this feature
needed made it break:

1. The route pipe converts without implicit conversion. So `price` (`@IsNumber`, no `@Type`)
   arrived as the string `"1"` and was refused: `price=1` → **400**, caught by the e2e suite.
   Fixed with `@Type(() => Number)` on `price`.
2. Once converted, `price=0` is the falsy number 0, so `if (filter.price)` skipped it and
   returned every activity (probe: 15 of 15). Fixed by comparing with `undefined`.

Both are pinned by tests: the controller spec for conversion, and the service spec plus the
e2e suite for `price=0`. FR-006 (filters unchanged) holds. Nothing is recorded in the register,
because no released behaviour was wrong.

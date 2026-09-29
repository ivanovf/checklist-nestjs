# Feature Specification: Usable Paging on the Reservation List

**Feature Branch**: `006-fix-reservation-paging`

**Created**: 2026-09-29

**Status**: Implemented

**Input**: User description: "help me to fix the bug #16, "D11: Paging on the reservation list is unusable", reported in github."

**Tracking issue**: [#16](https://github.com/ivanovf/checklist-nestjs/issues/16) (discrepancy D11 in
`specs/005-openapi-contract-export/discrepancies.md`)

## Background

The reservation list is meant to be read one page at a time: a caller asks for up to *N*
reservations, starting after the first *M*. Today, a signed-in caller who supplies either
paging value gets a refusal, even for obviously valid values such as `offset=0` or `limit=200`.
The only request that succeeds is one with no paging values at all, so a caller can see the
first page and nothing after it. For example:

```text
GET /api/reservations/all?sort=asc&limit=200&offset=0   →  400
  "limit must be a positive number", "offset must not be less than 0", …
```

The published API contract currently documents this as a known defect and tells callers to
omit both values.

## Clarifications

### Session 2026-09-29

- Q: What is the largest page a caller may ask for? → A: 50.
- Q: What happens when a caller asks for more than the maximum? → A: The request is refused
  as a bad request. It is not clamped.
- Q: Planning found that the same defect also leaves the list unbounded when paging values
  are omitted, returns oldest-first when no sort is given (the contract says newest-first),
  and makes "past stays = false" filter like "true". Fix only paging, or the whole list
  query? → A: The whole list query, accepting that callers who omit the sort now get
  newest-first, as the contract already documents.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read any page of reservations (Priority: P1)

A signed-in staff member (admin or authenticated user), usually through the mobile app,
browses the chalet's reservations. They ask for a page of a chosen size and move forward page
by page until they reach the end of the list.

**Why this priority**: This is the defect itself. Without it, only the first 10 reservations
of any listing can ever be reached.

**Independent Test**: Seed more reservations than one page holds, request consecutive pages
with explicit size and starting position, and confirm each page succeeds and together they
cover every reservation exactly once.

**Acceptance Scenarios**:

1. **Given** 25 reservations exist, **When** a signed-in caller asks for size 10 starting at 0,
   **Then** the request succeeds and returns the first 10 reservations in the requested order.
2. **Given** 25 reservations exist, **When** the caller asks for size 10 starting at 10, then
   at 20, **Then** each request succeeds, returning 10 and then 5 reservations, with no
   reservation repeated or skipped across the three pages.
3. **Given** the example request above with a size within the maximum
   (`sort=asc&limit=50&offset=0`), **When** it is sent, **Then** it succeeds. The original
   `limit=200` is above the maximum of 50 and is refused (User Story 3, scenario 2).
4. **Given** 25 reservations exist, **When** the caller asks for a page starting at 30,
   **Then** the request succeeds with an empty list.

---

### User Story 2 - Page through a filtered list (Priority: P2)

A staff member narrows the list (by platform, validated state, date range, past stays, or
sort order) and pages through only the matching reservations.

**Why this priority**: Filters already work on the first page; paging has to work with them
for the filters to be useful beyond 10 results.

**Independent Test**: Seed reservations of mixed types, filter by one type with an explicit
page size and starting position, and confirm only matching reservations are returned and
paged correctly.

**Acceptance Scenarios**:

1. **Given** 15 direct and 5 airbnb reservations, **When** the caller filters by type
   "direct" with size 10 starting at 10, **Then** the request succeeds and returns the last 5
   direct reservations and none of the airbnb ones.
2. **Given** any combination of the existing filters, **When** paging values are added,
   **Then** the filters keep the meaning they have today.

---

### User Story 3 - Clear refusal of invalid paging values (Priority: P3)

A caller (or a bug in a client) sends a paging value that makes no sense. The API refuses it
with a message that names the offending value, instead of refusing valid values alongside it.

**Why this priority**: It protects the API and helps client developers, but it only matters
once valid values are accepted.

**Independent Test**: Send each kind of invalid value and confirm a refusal that names the
field. Then send the boundary-valid values and confirm success.

**Acceptance Scenarios**:

1. **Given** a signed-in caller, **When** they ask for size 0, a negative size, a negative
   starting position, a fractional value, or a non-numeric value, **Then** the request is
   refused as a bad request and the message names the offending field.
2. **Given** a signed-in caller, **When** they ask for a size above the maximum page size,
   **Then** the request is refused as a bad request, and the message names the field and the
   maximum. It is never silently cut down to the maximum.

---

### Edge Cases

- Only one of the two paging values is supplied: the other takes its default (size 10,
  starting position 0).
- Neither is supplied: the list returns at most 10 reservations. This bound has to hold in
  practice, not only on paper. A request with no paging values must never return the whole
  collection.
- Values with leading zeros or surrounding whitespace (for example `limit=010`): they are
  treated like any other numeric string, with no special handling promised.
- The same paging value repeated in one request (`limit=5&limit=7`): refused as a bad
  request rather than guessed.
- A starting position beyond the last reservation: success with an empty list (User Story 1,
  scenario 4).
- A filter flag with a value other than "true" or "false" (for example `old=yes`): refused as
  a bad request (FR-010). Today such a request is accepted.
- An unauthenticated caller: still refused as unauthenticated, whatever the paging values.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The reservation list MUST accept a page size and a starting position supplied
  as query values, and MUST return the reservations at that position in the requested order.
- **FR-002**: Both paging values MUST stay optional. The page size defaults to 10 and the
  starting position to 0, and these defaults MUST actually bound the result when the values
  are omitted.
- **FR-003**: The page size MUST be a whole number of at least 1. The starting position MUST
  be a whole number of at least 0. Any other value MUST be refused as a bad request whose
  message names the field.
- **FR-004**: Paging MUST combine with every existing filter and sort option without
  changing what those filters mean.
- **FR-005**: The page size MUST have a hard maximum of 50, as the constitution requires
  for every list. A larger size MUST be refused as a bad request that names the field and
  the maximum. It MUST NOT be silently reduced to 50.
- **FR-006**: Requests that succeed today (no paging values, with or without filters) MUST
  keep succeeding. Their results MAY differ only in the ways this spec requires: at most one
  default page (FR-002), newest-first when no sort is given (FR-009), and a correct "past
  stays" filter (FR-010).
- **FR-009**: When no sort order is given, the list MUST be ordered newest-first, as the
  contract already documents. Reservations that share a start date MUST come back in a
  fixed order, so that paging never repeats or skips one.
- **FR-010**: The "past stays" and "validated" filters MUST mean exactly what their value
  says: "true" applies the filter and "false" does not. Any other value MUST be refused as a
  bad request naming the field.
- **FR-007**: The published API contract MUST describe the paging values as they now behave:
  optional, their defaults, their allowed range and maximum. It MUST no longer tell callers
  to omit them. It MUST also state that the filter flags accept only "true" or "false".
- **FR-008**: The record of discrepancy D11 MUST be marked resolved and point to this
  feature. The test that pinned the old behaviour MUST be replaced by a regression test
  proving the fix, and issue #16 MUST be closed by the change. The register MUST also
  correct its claim that the default page size applied, and record the sort-order and
  past-stays defects found during planning as resolved by this feature.

### Key Entities

- **Reservation page**: an ordered slice of the reservations that match the caller's
  filters. It is defined by a page size (how many reservations at most) and a starting
  position (how many matching reservations to skip). The response is still a plain list of
  reservations, in the same shape as today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of requests with valid paging values (within the allowed range) succeed.
  Today 0% do.
- **SC-002**: A client can reach every reservation in a listing of any size by stepping the
  starting position, with no reservation missed or repeated across pages (verified with at
  least 25 seeded reservations and a page size of 10).
- **SC-003**: Every request that succeeds today still succeeds after the change. Its result
  differs only as FR-006 allows.
- **SC-004**: No request, with or without paging values, returns more reservations than the
  maximum page size.
- **SC-005**: The published contract and the running API agree on the paging values: the
  contract checks pass with no recorded discrepancy left for this route's paging.

## Assumptions

- Scope is issue #16 only: the reservation list. The same kind of paging problem on the
  item, lock and user lists (issue #7 / D1, where omitting the values is refused) and the
  unbounded list routes (issue #11 / D6) are separate fixes and are not changed here.
- The response keeps its current shape, a plain list of reservations. A total count or
  "next page" link is not added, because either would change the contract for existing
  clients.
- Accepting values that used to be refused is not a breaking change under the constitution's
  versioning rule: those requests got a 400 before. Requests that succeeded before change
  only as FR-006 allows (see the next assumption). No new versioned path is needed.
- The behaviour changes in FR-006 match the contract as already published, so they are
  treated as a defect fix rather than a breaking change, and the pull request flags them for
  the reviewer.
- The known clash between the "past stays" filter and the "date to" filter (both bound the
  end date, so one overrides the other) is outside this fix and is left as it is.
- The mobile app is the main caller and will start sending paging values once they work. No
  change to the app is part of this feature.

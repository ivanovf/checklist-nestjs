# Feature Specification: Bounded Paging on the Activity, Activity Type and Configuration Lists

**Feature Branch**: `011-fix-unbounded-lists`

**Created**: 2026-10-01

**Status**: Implemented

**Input**: User description: "Fix the bug D6: Some list routes are unbounded #11"

**Tracking issue**: [#11](https://github.com/ivanovf/checklist-nestjs/issues/11) (discrepancy D6 in
`specs/005-openapi-contract-export/discrepancies.md`)

## Background

Every list in the API is supposed to be read one page at a time, with a bounded default and a
hard maximum. The account, item, lock and reservation lists were brought into line by features
006 and 007. Three lists were left behind: activities, activity types and device
configurations. Feature 005 recorded them as discrepancy D6, read from the source.

Running the three lists on 2026-10-01, with 60 records of each kind, confirmed the defect and
showed that the paging values are not refused either. They are silently ignored:

| Request (all three lists) | What happens today |
|---|---|
| no paging values | succeeds and returns **all 60** records: **the reported defect** |
| page size 5, starting position 10 | succeeds and returns **all 60**: the values are ignored |
| page size 0, 1000 or `abc`; starting position −1 | succeeds and returns **all 60** |
| any unknown query value (`foo=bar`) | succeeds and returns all 60 |

A client that asks for 5 records and receives 60 has no signal that its request was not
honoured.

Two further points were seen while checking:

- The activity list is ordered newest first by date, but activities that share a date come back
  in no guaranteed order. Once the list is paged, records with the same date could repeat or
  go missing across page boundaries.
- The activity list also filters by type, status and price. Those filters work today and must
  keep working alongside paging.

Access is unchanged by this feature: activities and configurations can be listed by any
signed-in account, activity types only by an administrator, and an unauthenticated caller is
refused on all three.

## Clarifications

### Session 2026-10-01

- Q: When a caller asks for one of these three lists without a page size, how many records
  should it get? → A: 10, on all three lists, the same default as every other list. The
  maximum stays 50.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lists never return an unbounded number of records (Priority: P1)

A signed-in staff member, usually through the mobile app, opens the activity, activity type
or configuration list without choosing a page. They get the first page, never the whole
collection, however large it has grown.

**Why this priority**: This is the reported defect. An unbounded list grows without limit as
activities accumulate season after season, and the constitution forbids it.

**Independent Test**: With more records than the default page size, request each list with no
paging values and confirm the response holds exactly one default-sized page.

**Acceptance Scenarios**:

1. **Given** 60 activities exist, **When** a signed-in caller lists activities with no paging
   values, **Then** the request succeeds and returns only the first page of the default size,
   newest first.
2. **Given** 60 activity types exist, **When** an administrator lists them with no paging
   values, **Then** the request succeeds and returns only the first default-sized page.
3. **Given** 60 configurations exist, **When** a signed-in caller lists them with no paging
   values, **Then** the request succeeds and returns only the first default-sized page.
4. **Given** fewer records than the default page size exist, **When** a caller lists them
   with no paging values, **Then** every record is returned, exactly as today.

---

### User Story 2 - Page through a whole list reliably (Priority: P2)

A staff member steps through a list page by page and sees every record exactly once, including
when filtering activities by type, status or price.

**Why this priority**: Once a list is bounded, paging is the only way to reach older records,
so consecutive pages must neither repeat nor skip a record.

**Independent Test**: With 15 records of each kind, several of the activities sharing a date,
read pages of 5 at starting positions 0, 5 and 10 and confirm they hold all 15 exactly once,
and that a page past the end is empty. Repeat for activities with a filter applied.

**Acceptance Scenarios**:

1. **Given** 15 activities, several sharing the same date, **When** the caller reads pages of
   5 from 0, 5 and 10, **Then** each page has 5 activities, newest first, and no activity
   appears twice.
2. **Given** 15 activity types or configurations, **When** the caller reads pages of 5 from 0,
   5 and 10, **Then** each page has 5 records and no record appears twice.
3. **Given** 15 activities of which 8 match a status filter, **When** the caller asks for that
   status with a page size of 5, **Then** the first page has 5 matching activities and the
   second the remaining 3.
4. **Given** any of the three lists, **When** the caller asks for a page starting past the end,
   **Then** the request succeeds with an empty list.

---

### User Story 3 - Invalid paging values are refused clearly (Priority: P3)

A caller, or a bug in a client, sends a paging value that makes no sense. The API refuses it
with a message naming the field, instead of ignoring it.

**Why this priority**: Silently ignored values hide client bugs. It matters less than bounding
the lists.

**Independent Test**: For each list, send each kind of invalid value and confirm a refusal that
names the field. Then send the boundary values and confirm success.

**Acceptance Scenarios**:

1. **Given** a permitted caller, **When** they ask for a page size of 0, a negative, fractional
   or non-numeric size, **Then** the request is refused as a bad request naming the page size.
2. **Given** a permitted caller, **When** they ask for a negative, fractional or non-numeric
   starting position, **Then** the request is refused as a bad request naming the starting
   position. It is never a server error.
3. **Given** a permitted caller, **When** they ask for a page size above the maximum of 50,
   **Then** the request is refused as a bad request naming the page size and the maximum.

---

### Edge Cases

- A page size exactly at the maximum is accepted. One above it is refused.
- The same paging value repeated in one request (`limit=5&limit=7`) is refused as a bad
  request, as on the other lists.
- An empty page size (`limit=`) is refused. An empty starting position (`offset=`) counts as 0,
  as on the other lists.
- Paging values combined with an invalid activity filter (an unknown status, a malformed type
  id) are refused as today, with the filter's message.
- An unauthenticated caller is refused as unauthenticated, and a non-administrator listing
  activity types is refused as forbidden, whatever the paging values. Permission is checked
  before the paging values.
- Each activity on a page still carries its full activity type, as today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The activity, activity type and configuration lists MUST return at most one page
  of records per request. None of them may return the whole collection.
- **FR-002**: Each list MUST accept an optional page size and an optional starting position.
  The page size defaults to 10 and the starting position to 0, the same as every other list.
- **FR-003**: The page size MUST be a whole number from 1 to a hard maximum of 50, and the
  starting position a whole number of at least 0. Any other value MUST be refused as a bad
  request whose message names the field (and the maximum, when it is exceeded). It MUST never
  be ignored, silently adjusted, or produce a server error.
- **FR-004**: The paging rules, defaults and messages MUST be the same as on the account, item,
  lock and reservation lists (features 006 and 007).
- **FR-005**: Each list MUST return its records in a fixed order, so that consecutive pages
  never repeat or skip a record. Activities stay newest first by date, with a fixed tie-break
  for activities that share a date. Activity types and configurations are ordered oldest
  first by creation, which is the order they come back in today.
- **FR-006**: On the activity list, paging MUST apply after the type, status and price filters,
  so a page holds only matching activities. The filters themselves are unchanged.
- **FR-007**: The response MUST keep its current shape: a plain list of the same records, with
  activities still carrying their full activity type. No total count or next-page link is
  added.
- **FR-008**: Access rules MUST be unchanged on all three lists.
- **FR-009**: The published API contract MUST describe both paging values on all three lists
  as optional, with their defaults, allowed range and maximum, and MUST stop describing the
  lists as unpaginated.
- **FR-010**: The record of discrepancy D6 MUST be marked resolved and point to this feature.
  The test that pinned the unbounded behaviour MUST be replaced by regression tests proving the
  fix, and issue #11 MUST be closed by the change. The register MUST also record the two
  findings made while specifying (paging values silently ignored; same-date activities in no
  fixed order) as fixed here.

### Key Entities

- **List page**: an ordered slice of activities, activity types or configurations, defined by a
  page size (how many at most) and a starting position (how many to skip). For activities it is
  taken from the records matching the caller's filters.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No request to any of the three lists returns more than 50 records, whatever the
  size of the collection. Today all three return the whole collection.
- **SC-002**: With 60 records of a kind, a request with no paging values returns exactly 10.
- **SC-003**: With at least 15 records, stepping through each list page by page, with or
  without an activity filter, returns every record exactly once.
- **SC-004**: 100% of invalid paging values are refused with a message naming the field. Today
  0% are; all are ignored.
- **SC-005**: With 10 or fewer records of a kind, the list returns the same records as today.
- **SC-006**: The published contract and the running API agree on paging for all three lists,
  and no API list remains recorded as unbounded.

## Assumptions

- Scope is the three lists named in issue #11. The other four lists were fixed by features 006
  and 007.
- The defaults (10 and 0) and the maximum (50) are the ones every other list already uses, so
  all seven lists behave the same. A caller that needs more than 50 records pages.
- Callers that rely on receiving every record today (for example the mobile app filling a
  selection of activity types, or reading the device configuration) will receive the first 10
  unless they page. A larger default for the two small reference lists was considered and
  rejected (clarified 2026-10-01) to keep one paging rule across the API. The chalet has few
  activity types and normally one configuration, so this is not expected to change what those
  callers see. The pull request flags the change for the reviewer.
- Paging values that are ignored today will be validated. A request that sends an invalid value
  and succeeds today will be refused. This is treated as closing a defect, not as a breaking
  contract change, because the contract never offered paging on these lists.
- Unknown query values other than paging (D5, issue #10) are out of scope. They stay as they are.
- The activity list's sort and filter fields may need database support to stay within the read
  budget; that is a planning concern.

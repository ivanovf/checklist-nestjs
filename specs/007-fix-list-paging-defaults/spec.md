# Feature Specification: Optional, Bounded Paging on the Account, Item and Lock Lists

**Feature Branch**: `007-fix-list-paging-defaults`

**Created**: 2026-09-29

**Status**: Implemented

**Input**: User description: "fix this issue https://github.com/ivanovf/checklist-nestjs/issues/7"

**Tracking issue**: [#7](https://github.com/ivanovf/checklist-nestjs/issues/7) (discrepancy D1 in
`specs/005-openapi-contract-export/discrepancies.md`)

## Background

The account, checklist item and lock lists are meant to be read one page at a time. Paging is
supposed to be optional, with a page size of 10 starting at the beginning. In practice, a
caller who leaves out either paging value is refused. The published API contract documents
this as a known defect.

Running the three lists on 2026-09-29 showed more than the missing defaults. Their paging
values have no allowed range at all:

| Request (all three lists) | What happens today |
|---|---|
| no page size, or no starting position | refused (400): **the reported defect** |
| page size 0 | succeeds and returns **every** record: the list is unbounded |
| page size −5 | succeeds and returns 5 records: a negative size is quietly treated as positive |
| page size 1000 | succeeds: there is no maximum |
| starting position −1 | **server error (500)** |

The reservation list had the same kind of defect. Feature 006 fixed it with optional values,
default 10 and 0, a size of 1–50, and a refusal above 50. This feature brings the other three
lists into line.

## Clarifications

### Session 2026-09-29

- Q: What is the maximum page size for the account, item and lock lists? → A: 50, the same
  as the reservation list. A client that loads more than 50 at once must page.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - List without supplying paging values (Priority: P1)

A signed-in staff member, usually through the mobile app, opens the account, item or lock
list without choosing a page. They get the first page instead of a refusal.

**Why this priority**: This is the reported defect. Every caller has to know about and send
two values that the contract describes as optional.

**Independent Test**: With more than 10 records of a kind, request each list with no paging
values, then with only one of the two. Every request succeeds and returns the expected page.

**Acceptance Scenarios**:

1. **Given** 15 items exist, **When** a signed-in caller lists items with no paging values,
   **Then** the request succeeds and returns the first 10 items.
2. **Given** 15 items exist, **When** the caller supplies only a starting position of 10,
   **Then** the request succeeds and returns the remaining 5 items.
3. **Given** 15 items exist, **When** the caller supplies only a page size of 5, **Then** the
   request succeeds and returns the first 5 items.
4. **Given** any of the three lists, **When** a request that succeeds today is repeated with
   the same valid values, **Then** it returns the same records.

---

### User Story 2 - Page through a whole list reliably (Priority: P2)

A staff member steps through a list page by page and sees every record exactly once.

**Why this priority**: Optional paging is only useful if consecutive pages neither repeat nor
skip records.

**Independent Test**: With 15 records, read pages of 5 at starting positions 0, 5 and 10, and
confirm that together they hold all 15 exactly once, and that a page past the end is empty.

**Acceptance Scenarios**:

1. **Given** 15 items, **When** the caller reads pages of 5 from 0, 5 and 10, **Then** each
   page has 5 items and no item appears twice.
2. **Given** 15 items, **When** the caller asks for a page starting at 20, **Then** the
   request succeeds with an empty list.

---

### User Story 3 - Invalid paging values are refused clearly (Priority: P3)

A caller, or a bug in a client, sends a paging value that makes no sense. The API refuses it
with a message naming the field. It never returns an unbounded list, silently reinterprets
the value, or fails with a server error.

**Why this priority**: It closes the unbounded-list and server-error holes found while
checking the defect. They matter less than the defect itself.

**Independent Test**: For each list, send each kind of invalid value and confirm a refusal
that names the field. Then send the boundary values and confirm success.

**Acceptance Scenarios**:

1. **Given** a signed-in caller, **When** they ask for a page size of 0, a negative size, a
   fractional or non-numeric size, **Then** the request is refused as a bad request naming
   the page size.
2. **Given** a signed-in caller, **When** they ask for a negative, fractional or non-numeric
   starting position, **Then** the request is refused as a bad request naming the starting
   position. It is never a server error.
3. **Given** a signed-in caller, **When** they ask for a page size above the maximum of 50, **Then** the
   request is refused as a bad request naming the page size and the maximum.

---

### Edge Cases

- A page size exactly at the maximum is accepted. One above it is refused.
- The same paging value repeated in one request (`limit=5&limit=7`) is refused as a bad
  request.
- An empty value (`limit=`) is refused. An empty starting position (`offset=`) counts as 0,
  matching the reservation list.
- An unauthenticated caller is still refused as unauthenticated, whatever the paging values.
  The existing access rules for each list are unchanged.
- The account list still never exposes password data, whatever page is requested.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The account, item and lock lists MUST accept requests with no page size, no
  starting position, or neither. The page size defaults to 10 and the starting position to 0.
- **FR-002**: The page size MUST be a whole number of at least 1, and the starting position
  a whole number of at least 0. Any other value MUST be refused as a bad request whose
  message names the field. It MUST never produce a server error or an unbounded list.
- **FR-003**: The page size MUST have a hard maximum of 50, the same as the reservation list.
  Larger values MUST be refused as a bad request naming the field and the maximum, not
  silently reduced.
- **FR-004**: Each list MUST return its records in a fixed order, so that consecutive pages
  never repeat or skip a record.
- **FR-005**: The paging rules, defaults and messages MUST be the same on all three lists,
  and the same as on the reservation list (feature 006).
- **FR-006**: Requests that succeed today with a page size of 1 up to the maximum and a
  starting position of 0 or more MUST keep succeeding with the same records. Requests with a
  page size of 0, a negative page size, or one above the maximum succeed today but will be
  refused. The change MUST be flagged to reviewers.
- **FR-007**: The published API contract MUST describe both paging values on all three lists
  as optional, with their defaults, allowed range and maximum.
- **FR-008**: The record of discrepancy D1 MUST be marked resolved and point to this feature.
  The tests that pinned the old behaviour MUST be replaced by regression tests proving the
  fix, and issue #7 MUST be closed by the change. The register MUST also record the
  unbounded, negative-size and server-error defects found while specifying, as fixed here.

### Key Entities

- **List page**: an ordered slice of accounts, items or locks, defined by a page size (how
  many at most) and a starting position (how many to skip). The response stays a plain list
  in the same shape as today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of list requests that omit one or both paging values succeed. Today 0% do.
- **SC-002**: No list request, whatever its paging values, returns more records than the
  maximum page size or ends in a server error.
- **SC-003**: With at least 15 records, stepping through a list page by page returns every
  record exactly once.
- **SC-004**: Every request that succeeds today with values inside the allowed range returns
  the same records after the change.
- **SC-005**: The published contract and the running API agree on paging for all three lists,
  with no recorded discrepancy left for their paging.

## Assumptions

- Scope is the three lists named in issue #7: accounts, checklist items and locks. The
  reservation list was fixed by feature 006. The other lists that ignore paging entirely
  (issue #11 / D6) are out of scope.
- The response keeps its current shape, a plain list, with no total count or next-page link.
- Access rules are unchanged: who may call each list stays as it is today.
- Refusing values that used to succeed (size 0, negative, above the maximum) is treated as
  closing a defect rather than a breaking contract change. Those requests were either
  unbounded, silently reinterpreted, or contrary to the constitution's hard-maximum rule. The
  pull request flags them for the reviewer.
- The fixed order is by creation (oldest first), which matches what the lists appear to
  return today. It only makes that order guaranteed.

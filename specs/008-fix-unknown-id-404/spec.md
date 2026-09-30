# Feature Specification: Honest Answers for Unknown and Malformed Record Ids

**Feature Branch**: `008-fix-unknown-id-404`

**Created**: 2026-09-30

**Status**: Implemented

**Input**: User description: "we needto fix this issue D2: An unknown id is answered as success https://github.com/ivanovf/checklist-nestjs/issues/8"

**Tracking issues**: [#8](https://github.com/ivanovf/checklist-nestjs/issues/8) (D2) and
[#12](https://github.com/ivanovf/checklist-nestjs/issues/12) (D7), both recorded in
`specs/005-openapi-contract-export/discrepancies.md`

## Clarifications

### Session 2026-09-30

- Q: Issue #8 covers ids that match nothing. A malformed id is issue #12, and it has the same
  cause. Fix both here? → A: Yes. Both issues are fixed by this feature.

## Background

Every record in the API (accounts, checklist items, reservations, lock codes, the device
configuration, activities and activity types) can be read, changed or deleted by its id.
When a caller names a record that doesn't exist, the API is supposed to say so. Running every
by-id operation on 2026-09-30 showed that most don't:

| Request with an id that matches no record | Today |
|---|---|
| account: read, change, delete; activity: read, delete | **refused as not found (404)**, which is correct |
| item, reservation, lock code, activity type: read or change; configuration: change (both kinds); activity: change; activity type: delete | **success (200) with an empty answer** |
| item, reservation, lock code: delete | **success (200), "deleted: true"**, although nothing was deleted |

| Request with a malformed id (e.g. `abc`) | Today |
|---|---|
| every by-id operation except the three below | **server error (500)** |
| item, reservation, lock code: delete | **success (200), "deleted: true"** |

A client that trusts these answers believes it changed or deleted a record that never
existed. The published API contract documents the false successes, because it describes
behaviour as it is, and it doesn't mention the server errors.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Told when a record does not exist (Priority: P1)

A staff member, usually through the mobile app, opens, edits or deletes a record that has
since been deleted, or was never there. They are told the record was not found, instead of
being shown an empty success or told it was deleted.

**Why this priority**: This is issue #8. False successes hide failed edits and deletions from
the people relying on them.

**Independent Test**: For each by-id operation, send a well-formed id that matches no record.
Every one is refused as not found, and nothing is created or changed.

**Acceptance Scenarios**:

1. **Given** no item has a given id, **When** a signed-in caller reads, changes or deletes it,
   **Then** each request is refused as not found, with a message naming the kind of record.
2. **Given** no reservation, lock code, activity type, activity or configuration has a given
   id, **When** a caller reads, changes or deletes it (whichever that record supports),
   **Then** the request is refused as not found.
3. **Given** a record that does exist, **When** a caller reads, changes or deletes it, **Then**
   the outcome is exactly what it is today.
4. **Given** a change request for an unknown id, **When** it is refused, **Then** no record is
   created by it.

---

### User Story 2 - A malformed id is a clear client mistake (Priority: P2)

A caller sends something that cannot be a record id at all, for example from a bug in a
client. The API refuses it as a bad request that names the id, instead of failing with a
server error or claiming a deletion.

**Why this priority**: This is issue #12. Server errors hide client bugs behind what looks like
an outage, and a false deletion is worse. It matters less than US1, because well-behaved
clients only send ids the API gave them.

**Independent Test**: For each by-id operation, send `abc` as the id. Every one is refused as a
bad request, and none is a server error or a success.

**Acceptance Scenarios**:

1. **Given** a signed-in caller, **When** they read, change or delete any record with a
   malformed id, **Then** the request is refused as a bad request whose message says the id
   is invalid.
2. **Given** a malformed id on a delete, **When** it is refused, **Then** the answer never
   says anything was deleted.

---

### Edge Cases

- An unauthenticated caller is still refused as unauthenticated before any id check, and a
  caller without the required role is still refused as forbidden. The existing access rules
  and their order are unchanged.
- A change request whose body is invalid is still refused for its body (400), as today, even
  when the id is unknown. The body is checked first.
- The device's tank-level report (the configuration's partial change) keeps its own
  device-key check. With a valid key and an unknown configuration id, it is refused as not
  found.
- Deleting a record twice: the second delete is refused as not found.
- Ids that are well-formed but belong to a different kind of record (an item's id used as a
  lock code's id) are simply unknown, so not found.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every operation that reads, changes or deletes one record by its id MUST refuse a
  well-formed id that matches no record as **not found (404)**, with the API's standard error
  shape and a message naming the kind of record.
- **FR-002**: Every such operation MUST refuse an id that is not well-formed as a **bad request
  (400)** whose message says the id is invalid. It MUST never answer with a server error or a
  success.
- **FR-003**: A delete MUST report a deletion only when a record was actually deleted.
- **FR-004**: A change to an unknown id MUST NOT create a record.
- **FR-005**: Behaviour for ids that exist MUST NOT change: the same statuses and the same
  response bodies. Authentication, role and body-validation refusals MUST keep their
  current precedence over the id checks.
- **FR-006**: The five operations that already answer "not found" correctly (account read,
  change and delete; activity read and delete) MUST keep doing so, and MUST gain the
  malformed-id refusal of FR-002.
- **FR-007**: The published API contract MUST document the not-found and bad-request
  answers on every by-id operation. It MUST no longer describe an empty success for unknown
  ids, and it MUST NOT list any status an operation doesn't actually return.
- **FR-008**: Discrepancies D2 and D7 MUST be marked resolved and point to this feature. The
  tests that pinned the old behaviour MUST be replaced by regression tests covering every
  by-id operation, and issues #8 and #12 MUST be closed by the change.

### Key Entities

- **Record id**: the identifier a caller uses to name one stored account, item, reservation,
  lock code, configuration, activity or activity type. It is either well-formed (it could name
  a record) or malformed (it cannot).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 20 by-id operations answer "not found" for an unknown well-formed id. Today
  5 of 20 do.
- **SC-002**: No by-id operation answers with a server error or a success for a malformed
  id. Today 17 of 20 answer with a server error and 3 claim a deletion.
- **SC-003**: No request that succeeds today for an existing record changes its answer.
- **SC-004**: The published contract and the running API agree on every by-id operation, with
  no recorded discrepancy left for unknown or malformed ids.

## Assumptions

- Scope is the 20 by-id operations listed in Background. Lists, creation and sign-in are
  untouched.
- "Not found" and "bad request" use the API's existing error shape (status, error and
  message), the one the account and activity routes already return.
- Turning false successes into refusals is not a breaking change under the constitution:
  those answers were wrong, and the contract recorded them as known defects. The pull request
  flags the change for reviewers, and the mobile app may need to handle a not-found where it
  used to receive an empty success.
- Other known defects on these routes are out of scope and unchanged: unprojected records
  (D3 / #9), invalid update bodies that are server errors (D8 / #13), user updates requiring
  every field (D9 / #14), and the device route's 404 for a wrong key (D10 / #15).

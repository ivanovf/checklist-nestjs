# Feature Specification: Wrongly Typed Fields Are Refused, Not Server Errors

**Feature Branch**: `014-fix-mistyped-fields`

**Created**: 2026-10-02

**Status**: Implemented

**Input**: User description: "Review and fix the discrepancies.md (D8) by feature 005, which
documents the API contract as it behaves without changing behaviour."

**Tracking issue**: [#13](https://github.com/ivanovf/checklist-nestjs/issues/13) (discrepancy D8 in
`specs/005-openapi-contract-export/discrepancies.md`)

## Background

Feature 005 recorded discrepancy D8: on two routes, changing an item or a reservation with a
field of the wrong type is answered with a server error (500) instead of a refusal (400). It
said that locks, activity types and activities refuse the same kind of body with 400.

Running every route that takes a body on 2026-10-02 showed that D8 is wider than recorded, and
that part of the record is wrong. The cause is the same everywhere. Before checking a field,
the API converts the sent value to the declared kind, checks the **converted** value, and then
stores the value **as it was sent**. So a value can pass the check and still not be the kind
the record holds. Depending on the value, one of three things happens:

| What is sent | Example | What happens today |
|---|---|---|
| An object where text is expected | `label: {…}` | **500**. The converted text passes the check; storage rejects the object |
| Anything but yes/no where yes/no is expected (except a list) | `status: "abc"`, `status: 7` | **500** on some fields, **400** on others (`checked`) |
| `true` where a date is expected | `dateIni: true` | **500** |
| Any non-number where a cost is expected | `cost: "abc"` | **500**. Cost has no type check at all |
| A number or yes/no where text is expected | `label: 7` | **succeeds**, stored as the text `"7"` |
| `true` where a number is expected | `budget: true` | **succeeds**, stored as `1` |
| A number where a date is expected | `dateIni: 7` | **succeeds**, stored as 7 ms after 1 January 1970 |
| Text where yes/no is expected, on a password change | `changePassword: "abc"` | **succeeds**, read as "yes" |
| An empty value (`null`) for a required field, on a change | `label: null` | **succeeds**, and the required field is stored empty |

The server errors were seen on create **and** change, on items, reservations (including the
checklist entries inside one), activity types, activities, device configurations and accounts.
Locks were the only kind with no server error, because their fields have a stricter rule of
their own, but they accepted numbers as codes. The record's claim that activity types and activities answer 400
is wrong: both answer 500 for an object in a text field.

The register entry exists so the contract states the behaviour as it is. This feature fixes the
behaviour and then brings the contract and the register in line with it.

## Clarifications

### Session 2026-10-02

- Q: When a value of another kind can still be read as the declared kind (a number for text,
  `true` for a number, a number for a date), should it be refused or stored converted? → A:
  Refused as a bad request. Only the declared kind is accepted, on every field, including lock
  codes and a reservation's lock, which accept a number today.
- Q: Should this feature also stop a change from storing `null` in a field that creating the
  record requires? → A: Yes, fixed here. Optional fields can still be cleared.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A wrongly typed field is refused clearly, never a server error (Priority: P1)

A client, usually the mobile app or a developer integrating with the API, creates or changes a
record and gets a field's type wrong. The API refuses the request as a bad request whose
message names the field and the expected kind, so the client can correct it. It never answers
with a server error, and nothing is stored.

**Why this priority**: This is the reported defect. A server error tells the client nothing,
looks like an outage, and the published contract says it does not happen.

**Independent Test**: For every route that takes a body, send each kind of wrongly typed value
listed in the Background that answers 500 today, on create and on change. Confirm each is
refused as a bad request naming the field, and that the stored record is unchanged.

**Acceptance Scenarios**:

1. **Given** an existing item, **When** an administrator changes its label to an object,
   **Then** the request is refused as a bad request naming the label, and the item is
   unchanged. (Today: 500.)
2. **Given** an existing reservation, **When** it is changed with `validated: "abc"`, a cost of
   `"abc"`, or a start date of `true`, **Then** each is refused as a bad request naming the
   field. (Today: 500.)
3. **Given** a reservation being created or changed, **When** one of its checklist entries has
   an object as its label or text as its status, **Then** the request is refused as a bad
   request naming that entry's field. (Today: 500.)
4. **Given** any of items, activity types, activities, device configurations and accounts,
   **When** an object is sent for one of its text fields on create or change, **Then** the
   request is refused as a bad request naming the field. (Today: 500.)
5. **Given** the same requests with correctly typed values, **When** they are sent, **Then**
   they succeed exactly as today.

---

### User Story 2 - What the API accepts is what it stores (Priority: P2)

A client sends a value of a different kind from the field's, such as a number for a text
field. The API refuses it and stores nothing. It never checks one value and stores another.

**Why this priority**: Today some mistyped values are silently stored in a converted form (a
date of 1 January 1970, the text `"true"` as a label, `"abc"` read as "yes, change my
password"). That is data corruption the client never hears about. It is less visible than a
server error, so it ranks second.

**Independent Test**: For each conversion in the Background table that succeeds today, send it
on create and on change. Each must be refused naming the field, and reading the record back
must show it unchanged.

**Acceptance Scenarios**:

1. **Given** an existing reservation, **When** it is changed with a start date of `7`, **Then**
   the request is refused as a bad request naming the start date, and the reservation is
   unchanged. (Today: stored as 1 January 1970.)
2. **Given** an account, **When** it is changed with `changePassword: "abc"`, **Then** the
   request is refused as a bad request naming the field. Text is never read as "yes" on a
   password change. (Today: read as yes.)
3. **Given** an existing item, **When** its label is changed to the number `7`, **Then**
   the request is refused as a bad request naming the label, and the label is unchanged.
   (Today: stored as the text `"7"`.)
4. **Given** an existing lock, **When** its code is changed to the number `1234` rather than
   the text `"1234"`, **Then** the request is refused as a bad request naming the code.
   (Today: stored as `"1234"`.)

---

### User Story 3 - A change cannot empty a required field (Priority: P3)

A client changes a record and sends an empty value (`null`) for a field that the record must
always have, such as an item's label or a reservation's start date. The API refuses it, so no
record ends up missing a field that creating it would have demanded.

**Why this priority**: Found while specifying, not part of the original report. It leaves
records that the API's own create rules would refuse, which later screens may not expect.

**Independent Test**: For each required field of each kind, send `null` on change and confirm
the refusal names the field and the record is unchanged. Confirm optional fields can still be
cleared.

**Acceptance Scenarios**:

1. **Given** an existing item, **When** its label is changed to `null`, **Then** the request
   is refused as a bad request naming the label. (Today: succeeds and stores an empty label.)
2. **Given** an existing reservation with a lock, **When** its lock is changed to empty,
   **Then** the lock is removed, as today. Optional fields that can be cleared today still can.

---

### Edge Cases

- A list sent where a single value is expected is already refused as a bad request today, and
  stays refused.
- Dates always arrive as text. A date in the forms clients send today (with or without a time,
  with or without a time zone) is accepted. A date that doesn't exist (30 February) or text
  that isn't a date is refused naming the field.
- A field's other rules (not empty, a range such as 1–8 guests, a lock code's digits, a known
  status) still apply after the type check, with today's messages.
- A request with several wrongly typed fields is refused once, with a message naming each of
  them.
- A wrongly typed field together with an undeclared field is refused, naming both, as the rule
  for undeclared fields already does (D5).
- On a change, an unknown or malformed id is refused as today (404, 400), and permission is
  still checked first (401, 403), whatever the body holds.
- A reservation whose dates are not available is still refused with "Reservation not
  available". A wrongly typed field is refused before availability is checked.
- The device route (`PATCH /api/config/:id`) keeps its key check and its answers (D10 is
  unchanged). A wrongly typed reading or time is refused as a bad request.
- Accounts: an unknown role is still a server error. That is discrepancy D12 (issue #17), not
  this feature. Duplicate emails (D13) are also unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every route that takes a body MUST refuse a field whose value is not of the
  field's declared kind as a bad request (400) whose message names the field. This applies to
  create and change, to nested values (the checklist entries of a reservation), and to every
  kind of record: items, reservations, locks, activity types, activities, device
  configurations and accounts.
- **FR-002**: No wrongly typed value MAY produce a server error. Every case listed in the
  Background as 500 MUST become a 400.
- **FR-003**: A request whose fields are of the right kind MUST behave exactly as today:
  same status, same stored record, same answer. A date's text must also be a real date (see
  Edge Cases).
- **FR-004**: A value of another kind MUST be refused as a bad request even when it could be
  read as the declared kind: a number or yes/no for text (lock codes and a reservation's lock
  included), `true` or `false` for a number, a number for a date. No value MAY be converted
  before it is stored; the stored value MUST be exactly the value that was checked.
- **FR-005**: Text MUST never be read as "yes" or "no". A yes/no field MUST accept only `true`
  or `false`.
- **FR-006**: Every field that has a declared kind in the contract MUST be checked against it.
  The reservation cost, which has no check today, MUST be checked as a number.
- **FR-007**: On a change, `null` for a field that a create refuses `null` for (every field the
  create does not mark optional, defaulted ones such as an item's `checked` included) MUST be
  refused as a bad request naming the field, and the record left unchanged. Sending `null` for
  an optional field MUST keep working as today (a reservation's lock is removed, a
  description is cleared).
- **FR-008**: A field's existing rules beyond its kind (required, ranges, formats, allowed
  values) and their messages MUST be unchanged. The one exception is the type message on date
  fields, which becomes `<field> must be a date in ISO 8601 format`, because dates are now
  checked as text.
- **FR-009**: Permission, id and availability checks MUST be unchanged, in the same order: a
  caller without permission is refused as today whatever the body holds.
- **FR-010**: The published API contract MUST state that wrongly typed fields are refused with
  400 on every route that takes a body, and MUST NOT describe a 500. It MUST stay in sync with
  the code (`docs:check` passes); if a schema changes, the regenerated contract is committed
  with the change.
- **FR-011**: The register entry D8 MUST be corrected to the scope observed on 2026-10-02 (all
  routes with a body, create and change; locks the only kind without a server error, though
  they accepted numbers as codes; activity types and activities wrongly recorded as 400), marked resolved, and point to this feature. The test
  that pinned the 500 MUST be replaced by regression tests proving the fix, and issue #13 MUST
  be closed by the change. The silent conversions and empty required fields found while
  specifying MUST be recorded under the entry as fixed by this feature.

### Key Entities

- **Field kind**: the kind of value a body field holds, as the contract declares it: text, a
  whole or decimal number, yes/no, a date, a list of checklist entries, a record id, or one of
  a fixed set of values.
- **Change body**: the fields sent to change a record. Every field is optional, but each one
  sent must be of its declared kind.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 of the wrongly typed requests listed in the Background produce a server error.
  On 2026-10-02, 49 of the field-and-value combinations tried did (not counting D12's role),
  across 6 of the 7 kinds of record.
- **SC-002**: 100% of refusals for a wrongly typed field name the field in their message.
- **SC-003**: For every request the API accepts, reading the record back returns a value of the
  field's declared kind, and no required field reads empty. No accepted label reads `"true"`,
  and no date reads 1970 unless 1970 was sent.
- **SC-004**: Every correctly typed request in the existing test suites passes unchanged.
- **SC-005**: The published contract and the running API agree for every route that takes a
  body, and D8 is no longer an open discrepancy.

## Assumptions

- "Fix D8" means change the behaviour so wrongly typed fields are refused, and then update the
  contract and register, as features 006 to 011 did for D1–D7, D11 and D15. Feature 005 itself
  only recorded behaviour; this feature is the one the register says will fix it.
- Scope covers every route with a body, not only the two named in the register, because the
  defect has one cause and leaving the other routes would leave the same 500 in place.
- A wrongly typed value that succeeds today and is refused afterwards is treated as closing a
  defect, not as a breaking contract change, because the contract already declares the kind of
  every field (as feature 011 treated ignored paging values).
- The mobile app sends values of the declared kinds. Checked in its source during planning
  (research R7): text as text, yes/no as `true`/`false`, numbers as numbers, dates as ISO text,
  and its edit screens stop a save with an empty date or type, so it never sends `null` for a
  required field. The device's payload can't be checked from source, so the pull request flags
  it.
- D12 (unknown role is a 500), D13 (duplicate emails), D9 (account changes need every field),
  D10 (device key) and D16 (406 on a password change) are out of scope and keep their pinned
  tests.
- Query values are out of scope. They were made strict by features 007 and 011.

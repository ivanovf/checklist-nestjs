# Feature Specification: Refuse Unknown Fields in Requests

**Feature Branch**: `010-fix-unknown-fields`

**Created**: 2026-10-01

**Status**: Implemented

**Input**: User description: "Fix the bug D5: The global validation pipe does not reject unknown fields #10"

**Tracking issues**: [#10](https://github.com/ivanovf/checklist-nestjs/issues/10) (D5) and
[#20](https://github.com/ivanovf/checklist-nestjs/issues/20) (D15), both recorded in
`specs/005-openapi-contract-export/discrepancies.md`

## Background

Every request that creates or changes a record (an account, checklist item, reservation, lock
code, the device configuration, an activity or an activity type) has a declared set of fields.
The constitution (Principle IV) requires the API to refuse a request carrying any other field,
so that undeclared data is never silently stored. D5 recorded that the API doesn't refuse them.

Running every create and change operation on 2026-10-01 showed the problem is wider than D5's
"accepted rather than refused". An undeclared field is not always thrown away. When the stored
record has a field of the same name, the value is **stored**:

| Undeclared field sent on a create or change | Today |
|---|---|
| a name the record doesn't have (e.g. `notAField`) | accepted (201/200), silently dropped |
| `_id` | accepted, and the new record **takes the caller's id** |
| `createdAt`, `updatedAt` | accepted, and the record **carries the caller's dates** (a 2000-01-01 creation date was stored) |
| a reservation's `userLock` | accepted and **stored**. It is how the mobile app records a reservation's lock. The declared `lockUser` is dropped (D15) |
| an unknown field inside a reservation's items | accepted, silently dropped |

The same holds on all seven kinds of record and on both create and change. The device's
tank-level report also accepts undeclared fields. A caller can forge a record's identity and
history, which the API is supposed to own.

Unknown **query** parameters are also accepted on every list (`?foo=1` answers 200). They are
ignored, not stored.

Sign-in is not body-validated at all, and an extra field there is accepted (201).

## Clarifications

### Session 2026-10-01

- Q: A reservation's `userLock` is undeclared, but it is the only name that stores a lock user
  today, because the declared `lockUser` is dropped (D15). Refuse it, fix D15 here, or keep
  accepting it? → A: Fix D15 here. The declared `lockUser` is stored, and `userLock` is refused
  like every other undeclared field. Issue #20 is closed by this feature too. *(Superseded by
  the last answer: the mobile app records the lock through `userLock`.)*
- Q: Should unknown query parameters on lists be refused like unknown body fields? → A: No.
  They keep being ignored. *(Superseded by the next answer.)*
- Q: Principle IV requires unknown fields refused on every input, but unknown query parameters
  were to stay ignored. How is that settled? → A: Follow the constitution: unknown query
  parameters are refused (400) like unknown body fields. No constitution change and no
  deviation.
- Q: Principle IV requires breaking changes on a new versioned path, but this feature changes
  15 operations in place. How is that handled? → A: As a defect fix, like spec 008: no new
  paths and no constitution change, with the deviation stated in the PR description.
- Q: The mobile app stores the lock's user slot (e.g. `"03"`) in `userLock` and looks up the
  door code itself from the lock list. Older reservations hold a lock code's id there. How is a
  reservation's lock handled? → A: Keep `userLock` as a declared, optional field holding the
  lock's user slot, with the same rule as a lock code's `userNumber`. An empty value removes the
  lock. The unused `lockUser` is deleted. Linking a reservation to the lock code record by id
  is left for a later spec.
- Q: The app sends a record's own `_id` in the body when editing reservations, lock codes,
  activities and activity types, and each checklist item's `_id`. Should the API accept it? →
  A: On a change, accept a top-level `_id` only when it equals the id in the path, and ignore
  it. A different `_id` is refused. A checklist item's `_id` is a declared field (a well-formed
  id) on create and change. On a create, a top-level `_id` is still refused. `createdAt`,
  `updatedAt` and `__v` are refused everywhere.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A request with an undeclared field is refused (Priority: P1)

A client (the mobile app, the tank-level device or a script) sends a create or change request
that includes a field the operation doesn't declare, through a typo, a stale client or on
purpose. The API refuses the whole request as a bad request that names the offending field,
and nothing is created or changed.

**Why this priority**: This is issue #10. Until it is fixed, any caller can choose a record's id
or backdate its history, and a client's misspelled field disappears without anyone noticing.

**Independent Test**: For each create and change operation, send a valid body plus
`notAField: true`. Every one is refused as a bad request naming `notAField`, and the record
store is unchanged.

**Acceptance Scenarios**:

1. **Given** a signed-in caller allowed to create items, **When** they create one with a valid
   body plus `notAField`, **Then** the request is refused as a bad request whose message names
   `notAField`, and no item is created.
2. **Given** an existing record of any kind, **When** a caller changes it with a body
   containing an undeclared field, **Then** the request is refused and the record is unchanged.
3. **Given** any create or change operation, **When** the body contains `createdAt`,
   `updatedAt` or `__v`, **Then** the request is refused, and the stored record never carries
   a caller-chosen date.
4. **Given** any create operation, **When** the body contains `_id`, **Then** the request is
   refused, and no record is created with a caller-chosen id.
5. **Given** a change to a record, **When** the body's `_id` equals the id in the path (as the
   mobile app sends it), **Then** it is accepted and the outcome is as today. **When** it differs,
   **Then** the request is refused as a bad request naming `_id`, and nothing changes.
6. **Given** a reservation whose items list contains an item with an undeclared field, **When**
   it is created or changed, **Then** the request is refused and names the field. An item's
   `_id` is declared, so a reservation saved with its items' `_id`s keeps them as today.
7. **Given** a body with only declared fields, **When** it is sent to any operation, **Then**
   the outcome is exactly what it is today.

---

### User Story 2 - The device's tank-level report is held to the same rule (Priority: P2)

The tank-level device reports a reading. If its report carries anything besides the reading,
the device key and the time, it is refused like any other request.

**Why this priority**: The device is the one caller that isn't a person using the app, so a
firmware change that adds a field must surface as a refusal and not be ignored. It is a single
operation, so it ranks below US1.

**Independent Test**: Send a tank-level report with a valid key plus an undeclared field. It is
refused as a bad request and the configuration is unchanged.

**Acceptance Scenarios**:

1. **Given** a configuration and its device key, **When** the device reports a reading with an
   extra field, **Then** the report is refused as a bad request and the stored reading is
   unchanged.
2. **Given** a report with only the declared fields, **When** it is sent, **Then** the outcome
   is exactly what it is today, including the existing refusal for a wrong key (D10).

---

### User Story 3 - A reservation keeps the lock it is assigned (Priority: P2)

Staff assign a door lock to a reservation by picking one of the lock codes ("Usuario 03 ·
2231"). The app sends that lock's user slot as `userLock`, and later shows the door code to
share with the guest by looking the slot up in the lock list. `userLock` becomes a declared
field, so the strict rule in US1 keeps accepting it, and the unused `lockUser` goes away.

**Why this priority**: This is issue #20 (D15). If US1 shipped without it, every reservation
save from the app would be refused, because the app always sends `userLock` once a lock is
assigned. It ranks below US1 because it touches one field on one kind of record.

**Independent Test**: Create a reservation with `userLock: "03"`, then read it: `userLock` is
`"03"`. Change it to `"05"`, then to empty, and read it after each change. Create one with
`lockUser: "3"`: refused as a bad request naming `lockUser`.

**Acceptance Scenarios**:

1. **Given** a signed-in caller allowed to create reservations, **When** they create one with
   `userLock: "03"`, **Then** the answer and every later read show `userLock: "03"`.
2. **Given** an existing reservation, **When** a caller changes its `userLock`, **Then** later
   reads show the new value. A change that leaves `userLock` out keeps the stored value.
3. **Given** a reservation with a lock, **When** a caller changes `userLock` to an empty value,
   **Then** later reads show no lock.
4. **Given** a reservation create or change, **When** `userLock` is neither a lock user slot
   (0–19) nor a well-formed lock code id, **Then** the request is refused as a bad request
   naming `userLock`.
5. **Given** a reservation stored earlier with a lock code's id in `userLock`, **When** it is
   read, or changed with that same value sent back, **Then** it behaves as today: it's shown
   unchanged and the change is accepted.
6. **Given** any reservation create or change, **When** the body contains `lockUser`, **Then**
   it is refused as an undeclared field.

---

### Edge Cases

- An unauthenticated caller is still refused as unauthenticated, and a caller without the
  required role is still refused as forbidden, before the body is looked at. The existing order
  of refusals is unchanged.
- A body with both an undeclared field and an invalid declared field is refused once, as a bad
  request listing every problem.
- A declared field with a default (an item's `checked` and `comments`) is still accepted when
  sent and still defaulted when left out.
- `userLock` was never checked, and is checked now. A value like `"ul"`, storable today, is
  refused. Values already stored are never rewritten or refused on read.
- A list that declares query parameters refuses an undeclared one (`?foo=1` → 400 naming
  `foo`), including alongside valid paging parameters. Declared list parameters keep their
  current validation and defaults.
- The configuration and activity-type lists declare no query parameters and don't read the
  query at all, so a parameter sent to them is still ignored (200). There's nothing to
  validate against.
- A change whose `_id` is malformed, or a well-formed id other than the path's, is refused as a
  bad request naming `_id`. The path id keeps its own checks (spec 008).
- A field sent as `null` or an empty value is still a declared field, judged by its own rules
  as today.
- A change to an unknown id with an undeclared field in its body is refused for the body (400),
  as invalid bodies already are: the body is checked before the record is looked up (spec 008).
  With a malformed id it is a 400 either way.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every create and change operation, including the device's tank-level report, MUST
  refuse a request body containing a field the operation doesn't declare, as a **bad request
  (400)** in the API's standard error shape, with a message naming each undeclared field.
- **FR-002**: The rule MUST apply at every depth, including each entry of a reservation's items.
- **FR-003**: A refused request MUST NOT create or change any record.
- **FR-004**: A request MUST NOT be able to set a record's id, creation date, last-change date or
  internal version. These belong to the API. A create MUST refuse `_id`. A change MUST accept
  `_id` only when it equals the id in the path, ignore it, and refuse any other value.
  `createdAt`, `updatedAt` and `__v` MUST be refused everywhere. A checklist item's `_id`
  inside a reservation is declared (a well-formed id) and is stored as today.
- **FR-005**: Requests with only declared fields MUST keep their current outcome: the same
  statuses, response bodies and defaults. The one exception is `lockUser`, which stops being
  declared (FR-011). Authentication and role refusals MUST keep their
  precedence over body validation.
- **FR-006**: The rule MUST hold for every current operation and for any operation added later,
  without each operation having to opt in.
- **FR-007**: Every list that declares query parameters (accounts, items, lock codes,
  reservations, activities) MUST refuse an undeclared query parameter as a **bad request (400)**
  naming it. Requests with only declared parameters MUST keep their current answers.
- **FR-008**: The published API contract MUST say that undeclared fields are refused, and every
  operation the rule newly refuses MUST document its bad-request answer. It MUST NOT list a
  status an operation doesn't actually return.
- **FR-009**: Discrepancies D5 and D15 MUST be marked resolved and point to this feature. The
  tests that pinned the old behaviour MUST be replaced by regression tests covering every create
  and change operation and the reservation lock, and issues #10 and #20 MUST be closed by
  the change.
- **FR-010**: A reservation's lock MUST be declared as `userLock`, which is optional. When
  given, it MUST be either a lock user slot (the same rule as a lock code's `userNumber`, 0–19)
  or a well-formed lock code id (how older reservations stored it), or empty to remove the lock.
  It MUST be stored as sent and answered as `userLock`. A change that omits it MUST keep the
  stored value.
- **FR-011**: The unused `lockUser` MUST be removed from the reservation's declared fields, so
  sending it is refused like any undeclared field. Lock values already stored MUST NOT be
  changed or lost.

### Key Entities

- **Declared field**: a field an operation publishes in the API contract as part of its request.
  Everything else in a request is undeclared.
- **API-owned field**: a stored field no caller may set: the record's id, creation date,
  last-change date and internal version. A change may repeat the record's own id, which is then
  ignored.
- **Reservation lock**: the door lock assigned to a reservation, sent and shown as `userLock`.
  It holds a lock code's user slot (e.g. `"03"`), or a lock code's id in older reservations.
  The door code shown to the guest is looked up from the lock codes by the app, not stored on
  the reservation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All create and change operations (7 creates, 7 changes and the tank-level report)
  refuse a body with an undeclared field. Today none do.
- **SC-002**: No request can store a caller-chosen record id or date, or move a record to a
  different id. Today every create can.
- **SC-003**: No request that succeeds today with only declared fields changes its answer,
  except requests using `lockUser`, which stops being declared (FR-011).
- **SC-004**: The mobile app's reservation create, edit and lock assignment keep working
  unchanged against the new API.
- **SC-005**: The published contract and the running API agree on undeclared fields and on the
  reservation lock, with no recorded discrepancy left for D5 or D15.
- **SC-006**: All 5 lists that declare query parameters refuse an undeclared one. Today none
  do.

## Assumptions

- The refusals and the removal of `lockUser` are made in place, as defect fixes, not on
  a new versioned path. Principle IV asks for a versioned path for breaking changes, so the pull
  request MUST state this deviation and why: both behaviours are recorded discrepancies (D5,
  D15), and spec 008 set the precedent. It must also flag that a client sending extra fields or
  parameters starts receiving 400.
- The mobile app (`flutter/reservations`, read on 2026-10-01) sends only declared list
  parameters, `userLock` holding a lock's user slot, and its own `_id` (and its checklist items'
  `_id`s) on changes, all of which stay accepted. The pull request asks for the app to be
  tried against the change before release.
- Linking a reservation to the lock code record by id, and the app's inability to remove a lock
  (it omits `userLock` when "Ninguna" is chosen), are out of scope. The first is a later spec,
  the second an app fix.
- Sign-in is out of scope. It isn't validated as a body today (the credential check reads it
  directly), so an extra field there is still accepted.
- Other known defects are out of scope and unchanged: unprojected records (D3 / #9), unbounded
  lists (D6 / #11), invalid update bodies that are server errors (D8 / #13), user updates
  requiring every field (D9 / #14), and the device route's 404 for a wrong key (D10 / #15).

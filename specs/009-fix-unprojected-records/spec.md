# Feature Specification: Stored Records Answered Only With Their Published Fields

**Feature Branch**: `009-fix-unprojected-records`

**Created**: 2026-10-01

**Status**: Implemented

**Input**: User description: "Fix the bug D3: Stored records are returned unprojected #9"

**Tracking issues**: [#9](https://github.com/ivanovf/checklist-nestjs/issues/9) (D3), recorded in
`specs/005-openapi-contract-export/discrepancies.md`, and D17 (a password stored as plain text),
which this feature records there and tracks as [#28](https://github.com/ivanovf/checklist-nestjs/issues/28)

## Clarifications

### Session 2026-10-01

- Q: An account change with `changePassword: false` stores the `password` it was sent as plain
  text. Fix it here, or in its own feature? → A: Here. It is recorded as D17 and fixed by this
  feature, next to D3.
- Q: Should this feature also repair production accounts already holding a plain-text password? →
  A: Yes. A one-off repair hashes any plain-text stored password in place, so the account signs in
  with that value again.
- Q: Remove `__v` from the existing routes in place, or publish the change under a new versioned
  path? → A: In place. The mobile app doesn't read `__v`, and the pull request flags the removal.
- Q: Survey production for stored fields the contract doesn't list before release? → A: No.
  Production records hold only the fields the contract lists. Anything else is dropped (FR-006).

## Background

Every kind of stored record (accounts, checklist items, reservations, lock codes, the device
configuration, activities and activity types) is sent back to callers when it is created, listed,
read or changed. The API is supposed to send only the fields the published contract describes for
that record. Instead it sends the record as the database stores it.

Every operation that answers with a stored record was run on 2026-10-01:

| What the answer carries today | Where |
|---|---|
| The database's internal revision counter (`__v`) | every record of every kind, in all 29 operations that answer with one |
| The same counter inside a nested record | the activity type embedded in an activity, when activities are read or listed |
| Every stored field, whatever it is | all 29 operations: nothing limits an answer to the documented fields |

No account answer carries a password hash today. That holds only because the account store hides
the hash by default. The answer itself doesn't keep it out, so a new stored field, or a query that
asks for the hash, would reach callers unnoticed. The constitution requires the opposite (Principle
II): records go out through a defined shape, so sensitive fields can't leak by default.

The published contract documents `__v` on every record, because it describes behaviour as it is.

Probing the account answers turned up a worse, related defect. An account change must carry every
field, including `password` (D9 / #14). When the change doesn't ask for a password change
(`changePassword: false`), that `password` value is still stored, as plain text, in place of the
password hash. Observed 2026-10-01: after one such change, a password change that gave the correct
current password was refused with 406, because the stored value was no longer a hash. Sign-in
then refused both the previous password and the value that was sent (401), so the account was
locked out. This
breaks the constitution's Principle III: passwords are stored only as bcrypt hashes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Answers carry only the published fields (Priority: P1)

A client developer, such as the one building the mobile app, reads the API contract and gets back
exactly the fields it lists for each record. Database internals are never sent.

**Why this priority**: This is issue #9. Internal fields tie clients to how records are stored, and
an answer that copies the stored record will send whatever is stored next.

**Independent Test**: Create, list, read and change one record of every kind. Every answer's fields,
including those of nested records, are within the contract's list for that record, and none carries
the revision counter.

**Acceptance Scenarios**:

1. **Given** a stored record of any kind, **When** a caller creates, lists, reads or changes it,
   **Then** the answer carries no field that the contract doesn't list for that record.
2. **Given** an activity whose activity type is embedded in the answer, **When** it is read or
   listed, **Then** the embedded activity type carries only the activity type's published fields.
3. **Given** a reservation with checklist items, **When** it is read, **Then** each item carries
   only the published fields of a reservation's item.
4. **Given** any answer that carries a record today, **When** this change is in place, **Then**
   every published field still has the same name, value and type, so existing clients keep working.

---

### User Story 2 - Sensitive fields can't leak by default (Priority: P2)

The owner of the service relies on account answers never containing a password hash. This must hold
whatever the store returns, not only because the store happens to hide the hash.

**Why this priority**: No hash leaks today, so this is protection against a future regression rather
than a live leak. It is still the constitution's stated reason for the rule.

**Independent Test**: Make the store hand the account answer a record that includes the password
hash and an unpublished field. The answer still carries neither.

**Acceptance Scenarios**:

1. **Given** an account record that includes its password hash, **When** it is returned by any
   account operation, **Then** the answer carries no password or hash.
2. **Given** a stored record with a field the contract doesn't list, **When** it is returned,
   **Then** that field is not in the answer.

---

### User Story 3 - Changing account details leaves the password alone (Priority: P1)

A staff member edits an account's name, email or role without asking to change its password. The
password stays exactly what it was, and the account can still sign in with it. A password is only
ever stored as a hash.

**Why this priority**: This is D17, a live defect. Every routine account edit can replace the hash
with whatever text was sent, which stores a password as plain text and can lock the account out.
It ranks with US1, and it is independent of it.

**Independent Test**: Edit an account with `changePassword: false` and any `password` value. The
stored password is unchanged and still a hash, the old password still signs in, and the value sent
doesn't.

**Acceptance Scenarios**:

1. **Given** an account, **When** a caller changes its details with `changePassword: false` and a
   `password` value, **Then** the stored password is unchanged and the account still signs in
   with its previous password.
2. **Given** the same change, **When** someone signs in with the `password` value that was sent,
   **Then** sign-in is refused.
3. **Given** a password change (`changePassword: true`) with the correct current password, **When**
   it succeeds, **Then** the new password is stored only as a hash, the new password signs in, and
   the old one doesn't.
4. **Given** any account change, **When** it is stored, **Then** the stored password is a hash. It
   is never the text that was sent.
5. **Given** stored accounts where some passwords are plain text from earlier changes, **When** the
   owner runs the one-off repair, **Then** each of those passwords is replaced by its hash, those
   accounts sign in with that value, and accounts that already held a hash are untouched.

---

### Edge Cases

- An optional field that a record doesn't have (a reservation with no cost, an activity type with
  no description) is still left out, as today, rather than sent empty.
- Empty lists still answer with an empty list.
- Answers that aren't stored records keep their current shape: the deletion confirmations, the
  sign-in token, the token check, the service information and the health answer.
- The activity type delete answers with the deleted record. That record is projected like any
  other.
- Refusals (400, 401, 403, 404 and so on) keep their current shape and precedence.
- Dates keep the format they are sent in today.
- An account change still requires every field, including `password`, `changePassword` and
  `currentPassword` (D9 / #14 is unchanged). With `changePassword: false`, the `password` and
  `currentPassword` values are accepted and ignored.
- The repair finds nothing to repair: it reports zero and changes nothing.
- The repair is run twice: the second run finds nothing, because every password is now a hash.
- The repair stops partway (for example, the connection drops): accounts already repaired stay
  repaired, and running it again finishes the rest.
- A plain-text value that happens to look like a hash can't be told apart from one, so it is left
  as it is. Its account is reset by hand, as before.
- A refused password change (wrong current password: 406, as today, D16) leaves the account
  entirely unchanged, including its other fields.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every operation that answers with one or more stored records MUST send only the fields
  the published contract lists for that kind of record. Today there are 29 such operations, for the
  seven kinds of record.
- **FR-002**: No answer MUST carry the database's internal revision counter, at the top level or in
  a nested record.
- **FR-003**: Nested records (an activity's activity type, a reservation's items) MUST follow the
  same rule as top-level records.
- **FR-004**: The published fields MUST keep their names, values and types. In particular, the
  record identifier keeps its current name, and the creation and change timestamps stay.
- **FR-005**: An account answer MUST never carry a password or password hash, even when the record
  it is built from contains one.
- **FR-006**: The fields of an answer MUST be decided by a defined list for each kind of record, not
  by what the store returns. A field added to storage MUST stay out of answers until it is added
  to that list and to the contract.
- **FR-007**: Statuses, refusals and the answers that aren't stored records MUST NOT change.
- **FR-008**: The published API contract MUST stop listing the revision counter, and MUST list
  exactly the fields each record's answer can carry.
- **FR-009**: Discrepancy D3 MUST be marked resolved and point to this feature. The test that pinned
  the old behaviour MUST be replaced by regression tests covering every operation in FR-001, and
  issue #9 MUST be closed by the change.
- **FR-010**: An account change that doesn't ask for a password change MUST leave the stored
  password unchanged, whatever `password` value it carries.
- **FR-011**: A stored account password MUST only ever be a hash, never the text sent by a caller,
  on every path that writes an account (creation, change and password change).
- **FR-012**: D17 MUST be recorded in the discrepancy register, with a GitHub issue opened for it
  once the owner approves opening it. It MUST be marked resolved by this feature, with regression tests that
  prove sign-in with the old and the sent passwords after each kind of account change, and the
  issue MUST be closed by the change.
- **FR-013**: A one-off repair MUST replace every stored account password that isn't a hash with the
  hash of that same value, and MUST leave passwords that are already hashes unchanged.
- **FR-014**: The repair MUST run only when the owner starts it, against a database the owner names.
  It MUST first be able to report, without changing anything, how many accounts it would repair and
  which ones, by account id only. It MUST NOT print, log or return any password value, plain or
  hashed, or any other personal data such as email addresses (constitution: personal data stays
  out of logs).
- **FR-015**: The repair MUST be safe to run more than once, and to run again after an interruption.
  Each account is repaired on its own, and a second run changes nothing.

### Key Entities

- **Published record shape**: for each of the seven kinds of record (and for the two nested
  ones), the list of fields a caller may receive. The contract describes it, and every answer
  follows it.
- **Internal field**: a field the store keeps for its own use, such as the revision counter, or
  one that must stay private, such as the password hash. It never appears in an answer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: None of the 29 operations sends the revision counter. Today all 29 do.
- **SC-002**: In every answer of every one of those operations, including nested records, 100% of
  the fields are listed in the contract for that record.
- **SC-003**: A field added to a stored record, without changing its published shape, appears in
  0 answers.
- **SC-004**: Every published field that a client reads today is still present with the same
  value. The existing end-to-end suites pass without having to change what they expect, apart from
  the D3 discrepancy test.
- **SC-005**: The published contract and the running API agree on every record's fields, with no
  recorded discrepancy left for D3.
- **SC-006**: After an account change without a password change, the account signs in with its
  previous password every time, and with the sent value never. Today the previous password stops
  working after one such change.
- **SC-007**: No account written by any path holds a password that isn't a hash.
- **SC-008**: After the repair, 0 stored passwords are plain text, every repaired account signs in
  with its stored value, and its output contains 0 password values.

## Assumptions

- Scope is the 29 operations that answer with stored records: create, list, read and change for
  accounts, items, reservations, lock codes and activities; create, list and both kinds of change
  for the configuration; and create, list, read, change and delete for activity types.
- The fields to keep are those the contract already publishes, minus the revision counter. That
  includes the record identifier as `_id` and both timestamps. Renaming `_id` to `id` would break the
  mobile app and is out of scope.
- Removing the revision counter isn't a breaking change under the constitution's versioning rule.
  It is a database internal, not a published field anyone should rely on, and the contract recorded
  it as a known defect. The owner confirmed on 2026-10-01 that the mobile app doesn't read it. The
  pull request flags the removal.
- The contract lists optional fields that answers often leave out (a reservation's cost, an activity
  type's description). Leaving a field out when the record has no value stays allowed.
- Production records hold only the fields the published contract lists (owner, 2026-10-01). No
  survey of production data is done. A field outside the contract is dropped from answers, as
  FR-006 requires.
- The sign-in token check sends the token's own claims, not a stored record, so it is out of scope.
- Other known defects on these routes are out of scope and unchanged: a reservation's discarded lock
  user (D15 / #20), the 406 password refusals (D16), and the account change requiring every field
  (D9 / #14).
- D17 is fixed in the same pull request as D3. Both were found on the account routes, and the owner
  chose to fix the security defect now rather than queue it.
- Production accounts may already hold a plain-text password from an earlier account change. The
  repair hashes those values, which makes the accounts work again with that value. It doesn't recover
  the password the person chose originally, which is gone. An affected person signs in with whatever
  value the client sent, and can then change it.
- Running the repair against production is the owner's decision and the owner's action. This
  feature delivers it and proves it against a test database. It doesn't run it on a deployed
  environment.

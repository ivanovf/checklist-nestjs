# Feature Specification: Password Recovery

**Feature Branch**: `012-password-recovery`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "Develop the endpoints required to implement recover password feature."

## Clarifications

### Session 2026-10-01

- Q: How does the recovery code reach the user, given the service cannot send email today? → A: An administrator issues the code for the account and passes it to the user out-of-band (in person or by message). The service sends nothing itself and gains no email dependency.
- Q: How long should a recovery code stay valid after an administrator issues it? → A: 1 hour.
- Q: After setting a new password with the code, is the user signed in straight away or do they sign in again? → A: They sign in again; completion only confirms the change and never issues a session.
- Q: Should administrators have a separate action to cancel an issued recovery code? → A: No. To void a code early, an administrator issues a new one (FR-007), which is shown only to them; every code expires within an hour anyway.
- Q: When a recovery completes, should sessions already signed in to that account stop working? → A: Yes, on every route; the existing change-password route is not changed to do the same.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A locked-out user gets back into their account with an administrator's help (Priority: P1)

A guest who has forgotten their password today has no way back in short of an administrator
deleting and recreating the account, or setting a password on their behalf and telling them
what it is. Instead, the user asks an administrator for help; the administrator issues a
one-time recovery code for that account and passes it to the user in person or by message;
the user enters the code in the app together with a new password of their own choosing. The
administrator never learns the new password.

**Why this priority**: This is the feature. Without it, a forgotten password means the
administrator handling a password in the clear. Each of the other stories hardens this one
and has no value on its own.

**Independent Test**: As an administrator, issue a recovery code for an existing account;
as an anonymous caller, submit that account's email address, the code and a new password;
then sign in with the new password and confirm the old one is refused.

**Acceptance Scenarios**:

1. **Given** a signed-in administrator and an existing account, **When** the administrator
   issues a recovery code for that account, **Then** the code is returned to the administrator
   once, together with when it expires.
2. **Given** an issued recovery code, **When** the account's email address, the code and a new
   password that meets the password rules are submitted without signing in, **Then** the
   password is replaced and the response confirms it without signing the user in; the app then
   signs in with the new password through the normal sign-in.
3. **Given** a completed recovery, **When** the user signs in with the new password, **Then**
   sign-in succeeds; **When** they sign in with the old password, **Then** it is refused.
4. **Given** a completed recovery, **When** the same recovery code is submitted again, **Then**
   it is refused and the password is not changed.

---

### User Story 2 - Recovery cannot be used to discover or take over accounts (Priority: P1)

Issuing a code is an administrator action, but completing a recovery is reachable without
signing in, so anyone on the internet can call it. It must not reveal which email addresses
have accounts or outstanding codes, must not let an attacker guess a code, must not let a stale
or leaked code be used long after it was issued, and no one but an administrator may issue one.

**Why this priority**: An unauthenticated route that can change a password is the most direct
account-takeover path the service could expose. Shipping Story 1 without these protections
would make the service less secure than having no recovery at all.

**Independent Test**: Attempt to issue a code as a non-administrator and anonymously; submit
completions for an unknown address, an address with no code, and with a wrong code, and
compare the refusals; submit wrong codes repeatedly; wait past the code's lifetime.

**Acceptance Scenarios**:

1. **Given** a signed-in non-administrator, **When** they try to issue a recovery code for any
   account, including their own, **Then** they are refused and no code is issued; **Given** an
   anonymous caller, **Then** they are refused as unauthenticated.
2. **Given** an unknown email address, an account with no outstanding code, or a wrong code,
   **When** a completion is submitted, **Then** the refusal is identical in every case.
3. **Given** a recovery code older than its lifetime, **When** it is submitted, **Then** it is
   refused and the password is not changed.
4. **Given** an account with an outstanding recovery code, **When** an incorrect code is
   submitted the maximum allowed number of times, **Then** the outstanding code is voided and
   even the correct code is refused afterwards; an administrator must issue a new one.
5. **Given** an account with an outstanding recovery code, **When** an administrator issues a
   new one, **Then** the earlier code stops working and only the newest one is accepted.
6. **Given** repeated completion attempts from one source, **When** they exceed the allowed
   rate, **Then** further attempts are refused with a rate-limit response until the window
   passes.

---

### User Story 3 - Sessions opened before the reset stop working (Priority: P2)

A password is often reset because the user suspects someone else knows it. Anyone already
signed in with the old password keeps a session that remains valid for up to a day. After a
successful recovery, those earlier sessions should stop being accepted.

**Why this priority**: It closes the gap that recovery is usually meant to close, but the
feature is still useful without it, and the exposure is bounded by the existing session
lifetime.

**Independent Test**: Sign in to obtain a session, complete a recovery for the same account,
then call any authenticated route with the earlier session and confirm it is refused, while a
session obtained by signing in with the new password is accepted.

**Acceptance Scenarios**:

1. **Given** a session issued before a password recovery, **When** it is used on any
   authenticated route after the recovery completes, **Then** it is refused as unauthenticated.
2. **Given** a session issued after the recovery, **When** it is used, **Then** it is accepted.
3. **Given** an account that has never been recovered, **When** its existing sessions are used,
   **Then** they behave exactly as they do today.

---

### Edge Cases

- An administrator issues a code for an account that does not exist: refused as not found. The
  route is administrator-only, so this reveals nothing an administrator cannot already list.
- A code is handed to the wrong person: the administrator issues a new code for the account,
  which voids the misdirected one immediately (FR-007). There is no separate cancel action.
- An administrator issues a code for their own account: allowed. Another administrator would
  normally do this; the sole administrator locked out of their own account is not covered
  (see Assumptions).
- The email address on completion is submitted with different letter case or surrounding
  whitespace from the stored one: it is treated the same way sign-in treats it, so recovery
  never succeeds for an address that could not sign in.
- The account is deleted while a recovery code is outstanding: the completion is refused with
  the same invalid-code refusal, not a server error.
- The new password does not meet the password rules: the submission is refused with a
  validation error, the code is **not** consumed and no attempt is counted, so the user can
  retry with a valid password.
- The new password equals the current password: accepted. Reuse rules are out of scope.
- Two completions race with the same valid code: exactly one succeeds; the other is refused.
- The request body is missing fields or carries extra ones: refused with a validation error.
  (Other routes currently accept unknown fields, discrepancy D5; these two routes must not.)
- A signed-in caller uses the completion route: it behaves the same as for an anonymous caller,
  and the outcome never depends on the caller's session. If the recovered account is the
  caller's own, FR-013 ends that session like any other.
- A client tries to set the record of when the password last changed through any other
  operation (account creation or update): the value is ignored. Only a completed recovery
  sets it, or a client could lock an account out of every session.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The service MUST offer an operation, restricted to administrators, to issue a
  recovery code for a given account.
- **FR-002**: Issuing MUST generate a single-use recovery code bound to that account and return
  it to the issuing administrator in that response only, together with its expiry time. The
  service MUST NOT be able to show the code again afterwards.
- **FR-003**: The service MUST offer a public operation, usable without signing in, to complete
  recovery by submitting the account's email address, a recovery code and a new password.
- **FR-004**: A recovery code MUST be a 6-digit number and MUST be stored only in a form from
  which the code cannot be recovered without the service's signing secret.
- **FR-005**: A recovery code MUST expire 1 hour after it is issued.
- **FR-006**: A recovery code MUST be usable only once; a successful completion MUST void it.
- **FR-007**: Issuing a new recovery code for an account MUST void any earlier outstanding code
  for that account.
- **FR-008**: After 5 incorrect code submissions for an account, the service MUST void the
  outstanding code; further submissions MUST be refused until a new code is issued.
- **FR-009**: The completion operation MUST be rate-limited per source, as sign-in is. This is
  defence in depth: the guessing bound (SC-006) rests on the per-account attempt limit
  (FR-008), which MUST hold across every running instance of the service.
- **FR-010**: The new password MUST be at least 8 characters and at most 72 bytes long (longer
  passwords would be silently truncated when stored); a submission that fails this
  rule MUST be refused with a validation error without consuming the code or counting an
  attempt.
- **FR-011**: On successful completion the account's password MUST be replaced, and the old
  password MUST no longer sign in. The response MUST only confirm the change and MUST NOT
  carry a session; the user signs in through the existing sign-in operation.
- **FR-012**: Refusals of a completion (unknown address, no outstanding code, wrong, expired,
  voided or already-used code) MUST all produce the same response, so the refusal does not
  reveal which condition applied or whether the account exists.
- **FR-013**: Sessions issued for an account before its password was recovered MUST be refused
  on every authenticated route after the recovery completes.
- **FR-014**: The recovery code MUST NOT appear in logs or in any response other than the
  issuing one; the new password and the full email address MUST NOT appear in logs or in any
  response.
- **FR-015**: Each issuance (naming the issuing administrator and the target account) and each
  completion (success or refusal) MUST be recorded as a security event naming the outcome,
  without the code or password.
- **FR-016**: Both operations MUST be documented in the published API contract with only the
  statuses they really return, and the issuing operation MUST appear in the authorization
  matrix as administrator-only, consistent with every other route.

### Key Entities

- **Recovery code**: A single-use secret, issued by an administrator, that lets the holder set
  a new password for one account. Attributes: the account it belongs to, the administrator who
  issued it, a non-reversible fingerprint of the code, when it was issued, when it expires, how
  many incorrect attempts it has absorbed, and whether it can still be used. At most one is
  outstanding per account.
- **User account** (existing): Gains a record of when its password last changed, used to tell
  sessions issued before a recovery from those issued after. Only a completed recovery may set
  it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who has forgotten their password can set a new one and sign in within 5
  minutes of receiving a code, and the administrator never sees or chooses that password.
- **SC-002**: An administrator can issue a recovery code for an account in a single action
  taking under 1 minute.
- **SC-003**: 100% of non-administrator and anonymous attempts to issue a code are refused.
- **SC-004**: 100% of completion refusals caused by the account or the code (FR-012) produce
  byte-identical status and body, whatever the reason.
- **SC-005**: 0 recovery codes are accepted after expiry, after use, after being superseded, or
  after the attempt limit is reached, across an automated suite covering each case.
- **SC-006**: Because only an administrator can create a code, an attacker gets at most 5
  guesses per code an administrator issues, so at most a 1 in 200,000 chance of guessing any
  given code.
- **SC-007**: 100% of sessions issued before a recovery are refused afterwards, and 100% of
  sessions issued after it are accepted.
- **SC-008**: No recovery code, password, or full email address appears in any log line
  produced during the automated recovery test suite.

## Assumptions

- Recovery is driven from the native Flutter app; there is no browser client (CORS is `none`),
  so the user types the code into the app rather than following a link.
- The code is passed from administrator to user out-of-band (in person or by message),
  usually while the user is waiting for it. A 1-hour lifetime leaves slack for an interrupted
  hand-off while keeping a code left in a chat history from staying usable; the 6-digit size,
  single use and attempt limit (FR-004, FR-006, FR-008) are what make it safe to guess against.
- The service sends no email or other message itself and gains no email-provider dependency.
  Self-service recovery by email can be added later on top of the same completion operation.
- An administrator locked out of their own account recovers through another administrator. A
  sole administrator who is locked out has no path in this feature and relies on the
  operator's database access, as today.
- Accounts are identified by email address and every account has one.
- Password rules: none exist today at account creation. This feature applies a minimum length
  of 8 to recovered passwords only; aligning creation and change-password is a separate change.
- The authenticated "change my password" flow on the account update route is unchanged and out
  of scope, including ending earlier sessions when it is used (FR-013 applies to recovery only), as are multi-factor authentication and administrators setting a password directly.
- Email addresses are matched exactly as sign-in matches them today; normalising address case
  across the service is out of scope.
- Existing sessions already re-read the account on every request, so refusing sessions issued
  before a recovery (FR-013) adds no new lookup.
- Changes to `src/auth/**` require explicit security review before merge (constitution,
  Security & Data Protection Standards).

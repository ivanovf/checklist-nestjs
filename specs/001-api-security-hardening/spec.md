# Feature Specification: API Security Hardening

**Feature Branch**: `001-api-security-hardening`

**Created**: 2026-09-07

**Status**: Draft

**Input**: User description: "spec the hardening work. Given the spread, consider splitting it: a security remediation feature (the two findings above, CORS, Helmet, rate limiting, config validation) separately from the testing and performance work."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Role restrictions are actually enforced (Priority: P1)

The chalet owner expects that only administrators can create, delete, or alter reservations,
user accounts, activity types, and service configuration, while ordinary authenticated guests
can only read what concerns them. Today several of those endpoint groups declare a role
restriction that is never checked, so any signed-in account — including a low-privilege guest
account — can perform administrator-only operations such as deleting a reservation or changing
another person's account.

**Why this priority**: This is a live privilege-escalation defect, not a theoretical weakness.
It is exploitable by anyone who already holds valid credentials, it affects the reservation
and user records that are the reason the service exists, and it requires no special tooling to
trigger. Nothing else in this feature matters if authorization does not hold.

**Independent Test**: Sign in as a non-administrator, call every endpoint that declares an
administrator-only restriction, and confirm each one is refused. Delivers value on its own by
closing the escalation path even if no other story ships.

**Acceptance Scenarios**:

1. **Given** a signed-in guest account, **When** it attempts an administrator-only operation on
   reservations, users, activity types, or configuration, **Then** the request is refused with an
   authorization error and no data is changed.
2. **Given** a signed-in administrator account, **When** it performs the same operations,
   **Then** they succeed exactly as before.
3. **Given** any endpoint that declares a role restriction, **When** the enforcement check is
   removed or misconfigured, **Then** an automated test fails, so the gap cannot silently return.
4. **Given** a request carrying no credentials, **When** it reaches any non-public endpoint,
   **Then** it is refused with an authentication error before any role check runs.

---

### User Story 2 - The service refuses to run misconfigured (Priority: P1)

The owner deploys to more than one environment. Today a required setting can be missing or
malformed and the service will still start, then fail unpredictably at request time or, worse,
operate with a weakened security posture that nobody notices. Separately, at least one access
check in the codebase compares against a credential written directly into the source rather
than one supplied by the environment.

**Why this priority**: A service that boots in a degraded security state is more dangerous than
one that refuses to boot, because the failure is invisible. Embedded credentials are permanently
compromised the moment the code is shared or published, and they cannot be rotated without a
code change and redeploy.

**Independent Test**: Remove or corrupt each required setting in turn and confirm the service
exits at startup naming the offending setting. Separately, scan the source tree and confirm no
credential literals remain.

**Acceptance Scenarios**:

1. **Given** a required configuration value is absent, **When** the service starts, **Then** it
   exits immediately and reports which value is missing, rather than starting and failing later.
2. **Given** a required configuration value is present but malformed or too weak to be safe,
   **When** the service starts, **Then** it exits immediately and reports what is wrong with it.
3. **Given** all required configuration is valid, **When** the service starts, **Then** it starts
   normally with no change to existing behavior.
4. **Given** the source tree, **When** it is scanned for credential literals, **Then** none are
   found, and every access check reads its credential from configuration.

---

### User Story 3 - Sign-in attempts are throttled (Priority: P2)

The sign-in endpoint is reachable from the public internet and currently accepts unlimited
attempts. An attacker can guess passwords for a known account for as long as they like without
the service noticing or slowing down.

**Why this priority**: The service has a small, fixed set of accounts, which makes guessing
attacks unusually attractive. This is a real exposure, but it is second to Story 1 because it
still requires the attacker to succeed at guessing, whereas Story 1 is exploitable by anyone
who already holds any valid credential.

**Independent Test**: Issue repeated failed sign-in attempts against one account and confirm
that further attempts are refused once the threshold is crossed, then confirm a legitimate
sign-in still succeeds after the lockout window elapses.

**Acceptance Scenarios**:

1. **Given** repeated failed sign-in attempts for the same account beyond the agreed threshold,
   **When** another attempt is made within the lockout window, **Then** it is refused without
   the password being evaluated.
2. **Given** a legitimate user who mistypes their password a small number of times below the
   threshold, **When** they enter it correctly, **Then** they sign in normally.
3. **Given** the lockout window has elapsed, **When** a correct password is supplied, **Then**
   sign-in succeeds.
4. **Given** any throttling decision, **When** it is made, **Then** it is recorded in the service
   log with enough context to investigate, and without recording the attempted password.

---

### User Story 4 - Only approved sites can call the API from a browser (Priority: P2)

The service currently accepts browser requests from any website. A page on an unrelated domain
can therefore invoke the API using a signed-in visitor's session context.

**Why this priority**: This widens the blast radius of any credential a user holds, but it
requires a user to visit a hostile page while signed in, making it less immediately exploitable
than Stories 1 and 3.

**Independent Test**: Issue a browser request from an origin that is not on the approved list and
confirm the browser refuses it; repeat from an approved origin and confirm it succeeds.

**Acceptance Scenarios**:

1. **Given** a request from an origin that is not approved for that environment, **When** it is
   made from a browser, **Then** the browser blocks it because the service did not approve it.
2. **Given** a request from an approved origin, **When** it is made, **Then** it succeeds
   unchanged.
3. **Given** no approved origins are configured for a deployed environment, **When** the service
   starts, **Then** it refuses to start rather than defaulting to accepting every origin.

---

### User Story 5 - Responses carry standard protective headers (Priority: P3)

Responses currently omit the standard set of headers that instruct browsers to avoid content-type
guessing, framing, and other well-known client-side attack patterns. Error responses may also
expose internal detail about the underlying data store.

**Why this priority**: These are defence-in-depth measures that reduce the impact of other
weaknesses rather than closing a directly exploitable hole, and they are the cheapest item here
to add once the rest is in place.

**Independent Test**: Request any endpoint and confirm the agreed header set is present on the
response; trigger a failure and confirm the response body contains no internal detail.

**Acceptance Scenarios**:

1. **Given** any endpoint, **When** it returns a response, **Then** the agreed set of protective
   headers is present.
2. **Given** a header that reveals the underlying server technology, **When** a response is
   returned, **Then** that header is absent.
3. **Given** an internal failure, **When** the error is returned to the caller, **Then** the body
   contains a stable, generic message and no stack trace, data-store detail, or query text.

---

### Edge Cases

- What happens when a signed-in user's role is changed or removed while they hold a valid,
  unexpired credential? The next request they make MUST be evaluated against their current role,
  not the role captured when they signed in.
- What happens when a credential is well-formed and correctly signed but names a role that no
  longer exists? The request MUST be refused rather than defaulting to permitted.
- What happens when an endpoint declares no role restriction at all? It MUST still require
  authentication unless it is explicitly and visibly marked as public.
- How does the system handle throttling when many users share one apparent network address?
  Throttling MUST NOT lock out an entire location because of one attacker; the account being
  targeted is the primary subject of the limit.
- What happens to the throttling counter when the service restarts, or when a second instance
  starts in parallel? The limit MUST NOT be trivially reset by causing a restart.
- What happens when a required setting is present but empty rather than absent? It MUST be
  treated as invalid, not as a valid empty value.
- What happens to the interactive API documentation page in a deployed environment? Its exposure
  MUST be a deliberate, stated decision rather than an accident of configuration.

## Requirements *(mandatory)*

### Functional Requirements

**Authorization enforcement**

- **FR-001**: System MUST reject any request to a non-public endpoint that does not carry valid
  authentication, before evaluating any role restriction.
- **FR-002**: System MUST enforce every declared role restriction on every endpoint that declares
  one, with no endpoint group exempt.
- **FR-003**: System MUST treat an endpoint as requiring authentication by default; any public
  endpoint MUST be marked as public explicitly and visibly at the endpoint itself.
- **FR-004**: System MUST refuse a request whose credential names an unknown, absent, or empty
  role, rather than permitting it.
- **FR-005**: System MUST evaluate authorization against the user's current role at request time.
- **FR-006**: System MUST record every refused authorization attempt with the acting account, the
  endpoint, and the timestamp, and MUST NOT record credentials or request bodies.
- **FR-007**: System MUST NOT expose an access-control mechanism that is defined but never
  applied, since an unapplied check reads as protection while providing none.

**Configuration and secrets**

- **FR-008**: System MUST validate every required configuration value at startup and MUST
  terminate with a message naming the offending value when any is missing, empty, or malformed.
- **FR-009**: System MUST reject a credential-signing secret that does not meet the agreed minimum
  strength, at startup rather than at first use.
- **FR-010**: System MUST source every secret, key, and connection credential from configuration;
  no such value may appear as a literal in the source tree.
- **FR-011**: System MUST NOT include secrets in any build artifact; they are supplied at runtime.
- **FR-012**: System MUST fail the build when a credential literal is detected in the source tree.

**Sign-in throttling**

- **FR-013**: System MUST limit consecutive failed sign-in attempts per account and refuse further
  attempts for a defined window once the limit is crossed.
- **FR-014**: System MUST refuse a throttled attempt without evaluating the supplied password.
- **FR-015**: System MUST NOT reveal, through its response or its timing, whether a refused
  sign-in failed because the account does not exist or because the password was wrong.
- **FR-016**: System MUST retain throttling state across a service restart and share it across
  concurrently running instances.

**Browser origin control**

- **FR-017**: System MUST approve browser requests only from an explicitly configured list of
  origins, configured separately per environment.
- **FR-018**: System MUST refuse to start in a deployed environment when no origin list is
  configured, rather than approving every origin.

**Response hardening**

- **FR-019**: System MUST include the agreed set of protective response headers on every response.
- **FR-020**: System MUST omit headers that disclose the underlying server technology or version.
- **FR-021**: System MUST return errors in a consistent shape that contains no stack trace, no
  data-store detail, and no query text.
- **FR-022**: System MUST reject request payloads containing fields it does not recognise, rather
  than accepting and ignoring them.

**Verification**

- **FR-023**: Every requirement above MUST be covered by an automated test that fails if the
  control is removed, so that no control in this feature can silently regress.

### Key Entities

- **Account**: A person who can sign in. Carries an identity, a credential verifier, and exactly
  one role. The role is the sole input to authorization decisions.
- **Role**: The privilege level attached to an account — currently an administrator level and a
  standard authenticated level. Determines which operations an account may perform.
- **Session credential**: The time-bounded proof of identity issued at sign-in and presented on
  each subsequent request. Carries identity and role only, and expires.
- **Protected endpoint**: An operation exposed by the service, together with the role restriction
  it declares. Every endpoint is protected unless explicitly marked public.
- **Sign-in attempt record**: The per-account tally of recent failed sign-ins and the point at
  which the account becomes temporarily refusable. Survives restarts.
- **Environment configuration**: The set of externally supplied values the service requires to
  run, each with a validity rule and an environment it applies to.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of endpoints that declare a role restriction refuse a request from an account
  lacking that role, verified by an automated test covering every such endpoint individually.
- **SC-002**: 100% of non-public endpoints refuse an unauthenticated request; the set of endpoints
  deliberately exempted is enumerated and reviewed, and contains no operation that reads or writes
  reservation or account data.
- **SC-003**: Zero credential literals remain in the source tree, verified automatically on every
  build, with the build failing if one is introduced.
- **SC-004**: For each required configuration value, removing it causes the service to exit at
  startup naming that value — verified for 100% of required values.
- **SC-005**: After the agreed number of consecutive failed sign-in attempts for one account,
  further attempts are refused for the full lockout window; a legitimate user staying below the
  threshold is never refused.
- **SC-006**: A browser request from an unapproved origin is blocked in 100% of attempts, while
  the owner's own front end continues to work with zero user-visible change.
- **SC-007**: 100% of responses carry the agreed protective header set, and zero responses
  disclose server technology or internal error detail.
- **SC-008**: An independent baseline security scan of the deployed service reports zero high or
  critical findings.
- **SC-009**: The owner and guests notice no change in day-to-day use: existing valid workflows
  continue to succeed, with zero regressions in the existing behavior of permitted operations.

## Assumptions

- The existing sign-in flow, credential format, and account store are kept as they are; this
  feature changes how access is *enforced*, not how identity is established.
- The two roles in use today (administrator and standard authenticated) remain the complete set.
  Finer-grained permissions are out of scope.
- Sign-in throttling defaults to 5 consecutive failed attempts per account within a 15-minute
  window, followed by a 15-minute refusal window. These are adjustable configuration values, not
  hardcoded constants.
- The credential-signing secret minimum strength is 32 bytes, per the project constitution.
- Throttling state is held in the existing data store rather than in process memory, so that it
  survives restarts and is shared across instances — necessary because the service runs on
  serverless infrastructure where instances are short-lived and parallel.
- Approved browser origins differ per environment and are supplied as configuration; local
  development may approve a permissive local origin, deployed environments may not.
- Testing and performance work — replacing the placeholder test suite, coverage thresholds,
  pagination, indexing, structured logging, and connection reuse — is explicitly **out of scope**
  for this feature and belongs to a separate specification, per the split the owner requested.
  The only testing in scope here is the coverage of this feature's own controls (FR-023).
- No data migration is required. Existing accounts, roles, and reservations are unaffected.
- This work is expected to be deployable without coordinated downtime, other than a normal release.

## Dependencies

- Requires the ability to set configuration values independently per deployed environment.
- Requires the owner to supply the list of approved browser origins for each deployed environment
  before that environment can be released with this feature (see FR-017).
- Requires the existing data store to be available for throttling state (see FR-016).

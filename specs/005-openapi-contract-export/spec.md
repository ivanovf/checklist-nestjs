# Feature Specification: Accurate, Exported API Contract

**Feature Branch**: `005-openapi-contract-export`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Make the API contract consumable by clients and agents without running the service or reading the source. Today the OpenAPI document served at /docs-json is thin and partly wrong: most responses have empty descriptions and no response schema (callers can see what goes in but not what comes out); POST /api/login documents no request body; GET /api/users/all (and similar list routes) lists no query parameters yet rejects requests without limit and offset with 400. Deliver: (1) an accurate OpenAPI document — every route declares its real request body, its real query/path parameters with their actual required/optional status, and a typed schema for each success response, with only the statuses the route really returns (consistent with the existing test/docs/ enforcement); (2) a committed openapi.json exported by a package script (e.g. pnpm docs:export) without needing a database, so consumers such as the Flutter client repo or an AI agent can read the contract offline; (3) a guard (test or CI check) that fails when the committed openapi.json drifts from what the code generates. Out of scope: changing route behaviour to match docs — where the docs and behaviour disagree, the docs describe real behaviour and the discrepancy is recorded (e.g. the limit/offset defaults that ParseIntPipe ignores) for a separate fix."

## Clarifications

### Session 2026-09-28

- Q: Is proving every documented status by execution in scope? → A: Partly. Authorization
  refusals are proven by the existing access-matrix suite. Success shapes are proven for
  sign-in plus one operation per access level, and every recorded discrepancy is proven.
  The remaining statuses are documented by inspection and guarded by the drift and
  completeness checks.
- Q: Should replacing the six definedness-only controller tests happen inside this feature,
  or in a separate PR first? → A: Inside this feature, in the same step that documents
  each module.
- Q: Besides `discrepancies.md`, should each discrepancy also be opened as a GitHub
  issue? → A: Both. The register is the detailed record, and one GitHub issue per entry
  links back to it.
- Q: Should the untyped `limit`/`offset` binding (D4) be fixed here with a typed query DTO,
  keeping both values required? → A: Yes. Fixed in this feature for the three routes that
  bind them (users, items, locks). Statuses stay the same; only the wording of the 400
  message may change.

## Context

The API's machine-readable contract is the only description its consumers have. The
constitution (Principle IV) already requires it to be accurate, to document every
endpoint's error cases, and to stay in sync with the code. Today it does none of that
reliably. Observed on 2026-09-28 against a running local instance:

- Most of the 38 operations declare a success status with an empty description and no
  response shape.
- Sign-in declares no request body at all.
- The user list declares no query parameters, yet refuses a request that omits `limit` and
  `offset` with 400.
- No operation declares its refusals (unauthenticated, forbidden, invalid input), although
  a route-by-route access matrix already exists and is enforced by the end-to-end suite.
- Fetching a user that does not exist returns 404, while fetching an item that does not
  exist returns **200 with an empty body**. A contract derived from reading the source
  would get the second case wrong.
- Project guidance names an `@ApiRefusals(...)` convention and a `test/docs/` enforcement
  suite. Neither exists in the codebase. This feature is where they come into being.

The contract is also only reachable while the service is running locally, because the
browsable documentation is deliberately not served once deployed. A consumer in another
repository, or an agent without a database, cannot read it at all.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the contract offline (Priority: P1)

A developer working on the mobile client, or an AI agent asked to call this API, opens a
single contract file checked into this repository. They find every operation with its
inputs and its outputs, without cloning dependencies, starting a database, or running the
service.

**Why this priority**: This is the whole point. An accurate contract that can only be read
by running the service does not reach the consumers who need it most. Even with today's
thin content, an exported file is immediately more useful than nothing.

**Independent Test**: From a fresh clone with no database available, run the single
export command. The contract file is produced, parses as a valid OpenAPI document, and
lists every operation the service registers.

**Acceptance Scenarios**:

1. **Given** a fresh clone with dependencies installed and no database running, **When**
   the developer runs the export command, **Then** the contract file is written within
   one minute and the command exits successfully.
2. **Given** the committed contract file, **When** a consumer reads it, **Then** it lists
   exactly the operations the service registers: none missing, none extra.
3. **Given** the export is run twice with no code change in between, **When** the two
   outputs are compared, **Then** they are byte-identical.

---

### User Story 2 - Trust what the contract says (Priority: P1)

A consumer writes a request and handles a response using only the contract, and the call
behaves as documented. It succeeds with the documented body. When it is refused, the
refusal is one the contract listed.

**Why this priority**: Equal to P1 in value. An exported contract that is wrong is worse
than none, because it looks authoritative. Kept as a separate story because the export
(US1) delivers value on its own, and accuracy is worked route by route.

**Independent Test**: For any single operation, build a request purely from the contract
and send it to a running instance. The success status and body shape match the contract,
and each documented refusal can be provoked and matches its documented status.

**Acceptance Scenarios**:

1. **Given** the contract for sign-in, **When** a consumer builds the request body from it,
   **Then** the body's field names and types are sufficient to sign in successfully.
2. **Given** the contract for a list operation that requires paging values, **When** a
   consumer reads it, **Then** those values are marked required, and a request omitting
   them is refused with the documented status.
3. **Given** an operation whose access is restricted, **When** it is called without
   credentials, or with insufficient rights, **Then** the refusal status matches one the
   contract lists for that operation.
4. **Given** the item-by-id operation, **When** it is called with an identifier that does
   not exist, **Then** the contract describes the real outcome (success status, empty
   body), not a not-found refusal the operation never produces.
5. **Given** any operation's documented success response, **When** a consumer reads it,
   **Then** it names the fields the response really contains, including stored-record
   fields such as the identifier and timestamps.

---

### User Story 3 - The contract cannot silently go stale (Priority: P2)

A contributor changes an endpoint's inputs, outputs or access, and forgets the contract.
The quality gates fail and say that the committed contract no longer matches the code, and
how to regenerate it.

**Why this priority**: Without it, US1 and US2 decay with the next unrelated change. It is
P2 only because it protects value the first two stories create; alone, it guards nothing.

**Independent Test**: Change a single documented field name in a request shape and run
the quality gates without regenerating the contract. The gates fail and name the contract
file. Regenerate it, and they pass.

**Acceptance Scenarios**:

1. **Given** a code change that alters the generated contract, **When** the committed
   contract was not regenerated, **Then** the quality gates fail with a message naming the
   file and the command that fixes it.
2. **Given** a code change that does not alter the generated contract, **When** the gates
   run, **Then** the contract check passes without any action from the contributor.
3. **Given** a new operation is added, **When** it declares no refusals or no success
   shape, **Then** the gates fail and name the operation.

---

### Edge Cases

- **Documentation and behaviour disagree** (for example, paging values that have
  defaults in the code but are required in practice): the contract describes the real
  behaviour, and the disagreement is recorded in the discrepancy register (FR-011). It is
  never fixed silently in this feature.
- **An operation returns a stored record whose shape varies** (optional fields absent on
  older records): fields that are not always present are documented as optional, not
  omitted.
- **An operation's success body is empty** (for example, the missing-item case): the
  contract states the empty body explicitly rather than leaving the shape unspecified.
- **An operation authenticates with a device key instead of a user sign-in** (the tank
  level update): its documented refusals reflect that scheme, not the user-sign-in one.
- **Export runs where configuration is absent**: the export must not require database
  credentials, secrets, or a reachable database, and must not write any secret into the
  file.
- **The same export is produced on different machines or operating systems**: the output
  is identical (stable ordering, consistent line endings), so the drift check never fails
  because of where it ran.
- **A sensitive field exists in storage** (password hash): it must not appear in any
  documented response shape. If a route is found to really return it, that is recorded as a
  defect, not documented as part of the contract.

## Requirements *(mandatory)*

### Functional Requirements

**Contract accuracy**

- **FR-001**: Every operation the service registers MUST appear in the contract, and the
  contract MUST contain no operation the service does not register.
- **FR-002**: Every operation that accepts a request body MUST document that body's fields,
  their types, and which of them are required. Sign-in is included.
- **FR-003**: Every query, path and header parameter an operation reads MUST be documented,
  with its required status matching the operation's real behaviour, not its intended
  behaviour.
- **FR-004**: Every operation MUST document the shape of its success response. Where the
  response is a stored record, the shape MUST include the fields actually returned
  (including identifier and timestamps). Where it is a list, the item shape MUST be
  documented. Where it is empty, that MUST be stated.
- **FR-005**: Every operation MUST document the refusal statuses it really produces:
  authentication and authorization refusals as defined by the existing access matrix,
  input-validation refusals where the operation validates input, and not-found only where
  the operation really produces it.
- **FR-006**: The contract MUST NOT document any status an operation cannot produce.
- **FR-007**: Every operation MUST carry a group and a one-line summary, and every
  documented status MUST carry a non-empty description.
- **FR-008**: No documented response shape may contain a credential or password hash.

**Offline export**

- **FR-009**: A single documented command MUST write the contract to a committed file at
  a stable, documented path. It MUST run without a database, without secrets, and without
  starting a network listener.
- **FR-010**: The export MUST be deterministic: identical code produces a byte-identical
  file regardless of machine, operating system, or run.

**Recording disagreements**

- **FR-011**: Every place where the documented real behaviour differs from what the code
  appears to intend, or from the constitution, MUST be recorded in a discrepancy register
  within this feature's directory. Each entry names the operation, the observed behaviour,
  the apparent intent, and how it was observed. Known entries at the time of writing:
  paging values required despite defaults; missing item returns 200 with an empty body;
  stored records returned unprojected (constitution Principle II); query parameters bound
  without a typed input shape (Principle IV).
  Each entry MUST also be opened as a GitHub issue that links to its register entry and
  to the test proving it, so the backlog stays visible after this feature merges
  (constitution Governance: violations found are "recorded as issues"). The register
  entry records the issue number.
- **FR-012**: The feature MUST NOT change any operation's runtime behaviour: status codes,
  bodies, validation and access stay exactly as they are. Only documentation metadata, the
  export, the checks, and tests (FR-017) change.
  **One exception, by clarification**: `limit` and `offset` on `GET /api/users/all`,
  `GET /api/items/all` and `GET /api/locks/all` are bound through a typed query DTO (D4).
  Both stay required, and every request keeps its current status: missing or non-numeric
  gives 400, numeric gives 200. Only the text of the 400 message may change.

**Keeping it true**

- **FR-013**: The quality gates MUST fail when the committed contract differs from what the
  code currently generates, with a message naming the file and the regeneration command.
- **FR-014**: The quality gates MUST fail when any operation lacks a group, a summary, a
  described success response with a shape, or at least one documented refusal (except a
  public operation that can genuinely never be refused).
- **FR-015**: Documented statuses MUST be demonstrated by automated tests that provoke
  them against a running instance, in this scope:
  - **Authentication and authorization refusals**: the existing access-matrix end-to-end
    suite is the proof. Each operation's documented access refusals MUST be derived from,
    and agree with, that matrix, so the two cannot disagree.
  - **Success status and response shape**: proven by execution for sign-in, and for at
    least one operation per access level (public, signed-in, administrator, device key).
  - **Every entry in the discrepancy register (FR-011)**: proven by execution, so that the
    recorded "real behaviour" is observed rather than inferred.
  - **All other statuses**: documented by inspection, and held in place by FR-013 and
    FR-014.
- **FR-016**: The project guidance MUST describe the convention actually in force for
  declaring refusals and the checks that enforce it. The references to a refusal
  convention and a `test/docs/` suite either become true or are corrected.
- **FR-017**: Each controller whose only test asserts that it exists (activity, config,
  items, locks, reservations, users) MUST have that test replaced, in the same step that
  documents the module, with tests asserting its routing, guard application, and input
  binding, as constitution Principle I requires when a subject is modified.

### Key Entities

- **Contract document**: the machine-readable description of every operation, its inputs,
  outputs and refusals. It is generated from the code, and committed at a stable path.
- **Operation**: one method-and-path pair the service registers. It has an access level
  (public, signed-in, administrator, device key), inputs, a success response, and a set of
  refusals.
- **Access matrix**: the existing, test-enforced list of every operation and who may call
  it. It is the source of each operation's authentication and authorization refusals.
- **Discrepancy register**: the list of places where real behaviour differs from apparent
  intent or from the constitution. It is the hand-off to a later behaviour-fixing feature.
  Each entry has a matching GitHub issue.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the 38 registered operations (the count at the time of writing)
  appear in the contract with a summary, typed inputs, a success response with a shape or
  an explicit empty body, and their refusals.
- **SC-002**: A consumer with no access to the source code or a running service can build a
  correct request for any operation from the contract alone. This is verified by a sample
  of at least 5 operations, one per access level plus sign-in, succeeding on the first
  attempt.
- **SC-003**: 0 real refusals observed in the end-to-end suite are missing from the
  contract, and every status proven by execution under FR-015 matches the contract. In
  the executed sample, 0 operations document a status that a real call cannot produce.
- **SC-004**: Producing the contract from a fresh clone takes one command and under one
  minute, with no database or secrets available.
- **SC-005**: A change that alters the contract without regenerating it is caught by the
  quality gates 100% of the time, and a change that does not alter it never trips the
  check.
- **SC-006**: Every known documentation-versus-behaviour disagreement is listed in the
  discrepancy register, and none is fixed by changing behaviour within this feature.

## Assumptions

- **The contract format is OpenAPI 3**, the format the service already generates. The
  request names it, so it is the subject of the feature rather than an implementation
  choice.
- **The committed file is JSON.** Measured on 2026-09-28, the minified JSON is about 28%
  smaller than the YAML equivalent. It is written pretty-printed for readable diffs; the
  size difference matters less than reviewable changes.
- **The contract file lives in this repository and is not published anywhere else.** The
  repository is private, and the browsable documentation stays unserved once deployed.
  Publishing the contract, for example to the mobile client repository, is a separate
  decision.
- **The existing access matrix is authoritative** for which operations require sign-in,
  administrator rights, or a device key. This feature documents those refusals; it does not
  re-derive or change them.
- **Real behaviour is established by running the service, not by reading the source**,
  following the project guidance. Several by-id operations look as if they refuse a missing
  record but do not.
- **Response shapes are documented as stored today**, including internal fields such as
  the record version counter. Projecting responses to hide those is a behaviour change,
  and belongs to a later feature (FR-011, FR-012).
- **The service's own route surface does not change during this feature.** If it does,
  the counts in SC-001 are updated rather than treated as a failure.

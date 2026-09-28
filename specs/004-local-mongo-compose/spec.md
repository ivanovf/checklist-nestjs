# Feature Specification: Local MongoDB via Docker Compose

**Feature Branch**: `004-local-mongo-compose`

**Created**: 2026-09-17

**Status**: Draft

**Input**: User description: "Help my to setup al docker-compose for a local connection with mongodb."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A developer gets a working local database in one command (Priority: P1)

Someone who has just cloned the repository runs a single command and has a database the
service can connect to. They do not install a database engine on their machine, do not
create users or databases by hand, and do not edit connection settings to make it work.

Today there is no way to do this. The local configuration already describes a database on
the developer's own machine — host `localhost`, port `27017`, an authenticating user, and a
named database — but nothing in the repository provisions it. A new contributor either
installs and configures an engine themselves, or points local development at a shared
remote database, which means working against data other people depend on.

**Why this priority**: Without this, nothing else in the feature has anywhere to run. It is
also the whole of what was asked for; everything below exists because this alone turns out
not to be sufficient.

**Independent Test**: On a machine with no database engine installed, clone the repository,
run the documented start command, then start the service and confirm it reports its data
store as reachable. Delivers value alone — local development becomes possible without
touching shared data.

**Acceptance Scenarios**:

1. **Given** a clone with no database running, **When** the developer runs the documented
   start command, **Then** a database is available on the host and port the local
   configuration already expects.
2. **Given** the database is running, **When** the developer starts the service, **Then**
   the service starts and its health route reports the data store as available.
3. **Given** the database is running, **When** the developer inspects it with the
   credentials from the local configuration, **Then** those credentials are accepted.
4. **Given** the database is already running, **When** the developer runs the start command
   again, **Then** it succeeds without error and without destroying existing data.

---

### User Story 2 - The local environment can actually be signed into (Priority: P1)

A developer with a freshly provisioned database can sign in and exercise the API, including
the endpoints that require an administrator.

A database alone does not achieve this. Creating an account requires an administrator, and
signing in requires an account that already exists, so an empty database cannot produce its
first administrator through the API at all. Provisioning storage and stopping there yields
an environment that starts cleanly and then refuses every useful request — technically
running, practically unusable.

**Why this priority**: Co-requisite with User Story 1 rather than a follow-up. A developer
who can start a database but cannot sign in has not been unblocked, and the failure is
confusing rather than obvious: everything reports healthy and every request is refused.

**Independent Test**: Against a freshly provisioned local database, sign in with the
documented development credentials, then call an administrator-only endpoint and confirm it
succeeds. No manual database manipulation permitted at any point.

**Acceptance Scenarios**:

1. **Given** a freshly provisioned local database, **When** the developer signs in with the
   documented development credentials, **Then** the sign-in succeeds and returns a token.
2. **Given** that token, **When** the developer calls an endpoint restricted to
   administrators, **Then** the request is permitted.
3. **Given** a local database that has already been seeded, **When** the seeding step runs
   again, **Then** it does not create duplicate accounts and does not fail.
4. **Given** the seeded account, **When** its stored representation is inspected, **Then**
   the password is held as a hash and not as readable text.

---

### User Story 3 - Local data persists, and can be deliberately discarded (Priority: P2)

A developer's local data survives restarting their machine or the database, so work in
progress is not lost between sessions. When they want a clean slate, one documented command
discards it.

**Why this priority**: Not required for the first successful run, which is why it sits
below the two stories above. It matters from the second session onward, and the reset path
matters as soon as someone changes the configured credentials — stale storage initialised
with the old ones then rejects the new ones, and the resulting authentication failure looks
like a configuration mistake rather than leftover state.

**Independent Test**: Create a record, stop and restart the database, confirm the record is
still present. Then run the documented reset command and confirm the database returns to
its freshly provisioned state.

**Acceptance Scenarios**:

1. **Given** data written locally, **When** the database is stopped and started again,
   **Then** the data is still present.
2. **Given** a running local database, **When** the developer runs the documented reset
   command, **Then** all local data is discarded and the next start provisions a clean
   database.
3. **Given** local data exists on disk, **When** the developer checks repository status,
   **Then** none of that data appears as a change to be committed.

---

### Edge Cases

- **The configured port is already in use**, because another database engine is running on
  the machine. The failure must name the conflict clearly rather than appearing as a
  connection error from the service later.
- **The service is started before the database is accepting connections.** The service
  retries indefinitely and never finishes starting, so no route — including the health
  route — is ever available. The developer sees a hang with no explanation. The documented
  order of operations must make this hard to hit, and the symptom must be written down,
  because it is indistinguishable from a broken application.
- **Stored data was initialised with different credentials** than the local configuration
  now declares. Authentication fails in a way that reads as a wrong password rather than as
  stale storage, and no credential change fixes it without a reset.
- **Local data accidentally committed.** Database files must be excluded from version
  control; they are large, machine-specific, and may contain personal data.
- **The seeding step runs against a database that is not empty.** It must be safe to repeat
  rather than creating duplicates or failing.
- **Someone points local development at a shared remote database instead.** Nothing in this
  feature prevents that, but it must not be the path of least resistance.
- **The automated test suite runs while the local database is up.** The suite must be
  unaffected by it, and must not read or write the developer's local data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A developer MUST be able to start a local database with a single documented
  command, without installing a database engine on the host.
- **FR-002**: The provisioned database MUST be reachable at the host, port, database name,
  and credentials that the existing local configuration already declares, so that no
  configuration change is needed to use it.
- **FR-003**: Starting the database when it is already running MUST succeed without error
  and without discarding data.
- **FR-004**: Local data MUST persist across restarts of the database and of the host
  machine.
- **FR-005**: A single documented command MUST discard all local data and return the
  database to a freshly provisioned state.
- **FR-006**: Local database files MUST be excluded from version control.
- **FR-007**: A developer MUST be able to sign in against a freshly provisioned database
  using documented development credentials, without manually manipulating the database.
- **FR-008**: The seeded account MUST hold administrator privileges, so that every endpoint
  can be exercised locally.
- **FR-009**: The seeding step MUST be safe to run repeatedly, creating no duplicate
  accounts and failing on neither an empty nor an already-seeded database.
- **FR-010**: Seeded credentials MUST be synthetic and intended for local use only, and MUST
  NOT match any credential used by a deployed environment.
- **FR-011**: The seeded account's password MUST be stored using the same protection as any
  other account, never as readable text.
- **FR-012**: This feature MUST NOT be required for any deployed environment; a deployment
  MUST continue to work with no reference to it.
- **FR-013**: The automated test suite MUST remain independent of the local database, and
  MUST NOT read or write its data.
- **FR-014**: Configuration committed for this feature MUST NOT contain any credential used
  by a deployed environment.
- **FR-015**: The documented setup MUST state the order of operations — database available
  before the service starts — and MUST describe the symptom of getting it wrong, because
  the service hangs rather than reporting an error.

### Key Entities

- **Development administrator account**: the single seeded account that makes a freshly
  provisioned environment usable. Holds an email, a display name, a protected password, and
  the administrator role. Synthetic and local-only; it is not a fixture the test suite
  depends on, and it carries no relationship to any real person.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with no database engine installed reaches a running service with
  a reachable data store in under 5 minutes and no more than 3 commands, following only the
  written instructions.
- **SC-002**: 100% of first sign-in attempts against a freshly provisioned environment
  succeed using the documented credentials, with no manual database manipulation.
- **SC-003**: Every endpoint restricted to administrators can be exercised locally using
  the seeded account.
- **SC-004**: Data written locally survives a database restart 100% of the time.
- **SC-005**: The documented reset command returns the environment to its freshly
  provisioned state, after which the first sign-in succeeds again.
- **SC-006**: Repository status shows no local database files as pending changes at any
  point.
- **SC-007**: The automated test suite produces identical results whether or not the local
  database is running.
- **SC-008**: A deployment succeeds with no reference to anything introduced by this
  feature.

## Assumptions

- **The database runs in a container; the service runs on the host.** The existing local
  configuration names `localhost` as the database host, which only works if the service is
  not itself containerised. Containerising the service as well would require changing that
  host and would replace a fast edit-and-reload loop with rebuilds — a larger change than
  was asked for, and one the existing configuration argues against.
- The existing local configuration values are taken as the target to satisfy rather than
  something to redesign: the database name, user, port, and authentication settings already
  recorded there define what the container must provide.
- Local database files live in the directory version control has already been told to
  ignore, so persistence needs no new exclusion rule.
- The automated test suite continues to use its own throwaway in-memory database. This
  feature is for running the service by hand, not for testing, and the two must not share
  storage.
- The existing container definition under `docker/` targets a serverless deployment
  platform and is unrelated to local development. It is left alone. It does pin an older
  runtime than the project now declares, which is worth correcting separately but is out of
  scope here.
- A single seeded administrator is sufficient. Seeding representative reservations, items,
  or activity data is a larger exercise with its own design questions and is out of scope.
- Developers have a container runtime installed. Installing one is outside what the
  repository can automate.
- No database management interface is provided. The documented credentials work with any
  client a developer prefers, and adding one would expand the surface for no clear benefit.

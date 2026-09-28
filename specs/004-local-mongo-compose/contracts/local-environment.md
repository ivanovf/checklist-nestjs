# Contract: Local Environment

**Feature**: `specs/004-local-mongo-compose` | Serves FR-001 – FR-006, FR-012 – FR-015

## Commands

Five package scripts. They exist because every compose invocation needs `--env-file .env.local`
(verified load-bearing — without it interpolation yields empty values), and because reset is
two ordered operations rather than one.

| Command | Does | Contract |
|---|---|---|
| `pnpm db:setup` | `db:up` then `db:seed` | The one command a newcomer runs. Idempotent in both halves |
| `pnpm db:up` | Starts the database, waits for health | Idempotent. Succeeds if already running, without touching data |
| `pnpm db:down` | Stops the container | Leaves data on disk |
| `pnpm db:reset` | Stops and removes the named volume | Next `db:setup` provisions a clean database |
| `pnpm db:seed` | Creates the development administrator | Idempotent — see [seed-account.md](./seed-account.md) |

`db:setup` exists specifically to meet SC-001's three-command budget. Without it the shortest
honest path is four commands and the criterion cannot be met — the individual scripts remain
available for the cases where only one half is wanted.

## Setup path

The documented route from a fresh clone, against SC-001's budget of under 5 minutes and no
more than 3 commands:

```bash
cp env.example .env.local     # fill in nothing — the defaults work locally
pnpm db:setup              # database up, healthy, and seeded
pnpm start:dev             # service running against it
```

Three commands, which is the budget SC-001 sets.

`env.example` must therefore ship values that work unedited for a purely local run. A
template requiring the developer to invent a password before anything starts fails the
budget and invites them to skip straight to a shared database.

## Ordering

**The database must be healthy before the service starts.** This is the one sequencing rule
that must appear in the documentation, because getting it wrong produces a hang rather than
an error: the application retries a failed connection indefinitely and never finishes
starting, so no route — not even the health route — ever answers. A developer sees a silent
process and has nothing to read.

`db:up` therefore waits on the container healthcheck rather than returning as soon as the
container is created.

## Service definition requirements

| Requirement | Reason |
|---|---|
| Image pinned to `mongo:7` | An unpinned tag puts two developers on different servers silently |
| `MONGO_INITDB_ROOT_USERNAME` / `_PASSWORD` / `_DATABASE` interpolated from `.env.local` | One source of truth; container and application cannot drift; no literal committed |
| Host port published from `${DB_PORT}` | The application connects over `localhost`, not a container network |
| A named volume, not a bind mount | The image chowns `/data/db`, which macOS file sharing refuses on a host directory — verified to crash-loop. Also puts database files outside the working tree, so they cannot be staged |
| Healthcheck running a database ping | Makes readiness observable; measured at ~1s |
| Restart policy that does not fight a deliberate stop | `db:down` must actually stop it |

No credential literal may appear in the committed file. This is the constitution's "no
secrets in source" rule, and it is also what keeps the two consumers in agreement.

## Boundaries

| Must | Must not |
|---|---|
| Work with the service running on the host | Require the service to be containerised |
| Leave `database.module.ts` connection logic unchanged | Add `authSource` or move the database name into the URI path (see [data-model.md](../data-model.md)) |
| Leave the test suite untouched | Share storage with the test suite, which uses its own in-memory database |
| Stay absent from every deployed environment | Become a deployment dependency |
| Keep `git status` clean once data exists | Commit database files |

## Test expectations

| Case | Expectation |
|---|---|
| `db:up` from nothing | Database reachable at the configured host and port; health route reports available |
| `db:up` when already running | Succeeds; data intact |
| Service started before the database | Documented as a hang, with the cause named |
| Configured port already in use | Fails naming the port conflict, not as a later connection error |
| Stop and start | Data still present |
| `db:reset` then `db:up` | Clean database; first sign-in works again after re-seeding |
| `git status` with data present | No pending changes — the volume is outside the tree |
| Full test suite with the database running, and with it stopped | Identical results |
| A deployment | Succeeds with no reference to any of this |

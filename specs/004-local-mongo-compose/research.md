# Phase 0 Research: Local MongoDB via Docker Compose

**Feature**: `specs/004-local-mongo-compose` | **Date**: 2026-09-18

Every decision below was checked against a running container or the repository itself rather
than reasoned about. The two that mattered most — whether the application's existing
connection options authenticate against a container-initialised user, and whether a fresh
clone can even be configured — both turned up things that would have derailed
implementation.

---

## R1 — What the compose file provides

**Decision**: MongoDB only. The service keeps running on the host via `pnpm start:dev`.

**Rationale**: `.env.local` already declares `DB_HOST=localhost`. That value only works if the
service is not itself containerised, so the repository has effectively already made this
choice. Containerising the service too would mean changing that host, and trading an
edit-and-reload loop for image rebuilds.

**Alternatives considered**: a service container alongside the database was rejected — it
changes existing configuration, slows the development loop, and was not what was asked for.

---

## R2 — Image and version

**Decision**: `mongo:7`.

**Rationale**: The installed driver is `mongodb@6.6.2` with `mongoose@8.4`, both of which
support MongoDB 7. Nothing in the repository pins a server version, and 7.x is a current
stable line that matches what a managed cluster would typically be running.

**Alternatives considered**: `mongo:latest` was rejected — an unpinned tag means two
developers can silently be on different server versions, which is exactly the class of
"works on my machine" this feature exists to remove.

---

## R3 — Credentials, and where they come from

**Decision**: The container is initialised from `.env.local` by running compose with
`--env-file .env.local`, interpolating `${DB_USER}`, `${DB_PASS}`, `${DB_NAME}` and
`${DB_PORT}` into the service definition. No credential literal appears in the committed
compose file.

**Rationale**: Constitution III prohibits credentials as literals in source. More practically,
the container's credentials and the application's credentials must agree, and the only way to
guarantee they cannot drift is to read both from one file. `.env.local` is already that file.

**Verified**: `docker compose --env-file <file> config` interpolates correctly —
`user=root db=checklist port=27017` — while the same file without `--env-file` yields
`user= db= port=`. So the flag is load-bearing, not decorative, and must be part of the
documented command.

**Consequence**: the start command is longer than `docker compose up`. R9 wraps it in an npm
script so FR-001's "single documented command" still holds.

---

## R4 — Authentication actually works (verified against a live container)

**Decision**: No change to `database.module.ts` or to `DB_ARGS`. The existing connection
options authenticate as-is.

This was the riskiest assumption in the feature. `MONGO_INITDB_ROOT_USERNAME` creates the
user in the `admin` database, while the application asks to work in `checklist` — a
mismatch that would normally fail. It does not, and the reason is subtle.

**Verified** against `mongo:7` initialised exactly as compose will:

| Connection | Result |
|---|---|
| `mongodb://host:27018/?authMechanism=DEFAULT` + `dbName: 'checklist'` — what the app builds today | **AUTH OK**, wrote to `checklist` |
| `mongodb://host:27018/checklist?authMechanism=DEFAULT` — the same thing with the database in the path | **Authentication failed** |
| `mongodb://host:27018/checklist?authMechanism=DEFAULT&authSource=admin` | AUTH OK |

The application works **because** it leaves the database out of the URI path and passes
`dbName` as a separate option. With no database in the path the driver defaults its
authentication source to `admin`, which is where the root user lives. Put the database in
the path and the authentication source becomes `checklist`, where that user does not exist.

**Constraint this places on future work**: `database.module.ts` must keep building the URI
without the database name in the path, unless `authSource=admin` is added at the same time.
Someone "tidying up" that string would break local authentication, and the error says only
`Authentication failed` — it points at credentials, not at the URI shape. Worth a comment at
the construction site.

---

## R5 — Persistence and reset

**Decision**: A **named volume**. Reset is `docker compose down -v`.

**This decision was reversed during implementation.** The original choice was a bind mount at
`./mongo_data`, because `.gitignore` has carried `mongo_data/*` since before this feature and
honouring it seemed to need no new exclusion rule.

**It does not work on macOS.** The image's entrypoint chowns `/data/db`, and Docker Desktop's
file sharing refuses ownership changes on a host directory. Two distinct failures were
observed:

| Attempt | Result |
|---|---|
| Directory absent | `error while creating mount source path … chown …: permission denied` |
| Directory pre-created | Container starts, then crash-loops: `chown: changing ownership of '/data/db': Permission denied`, reported unhealthy |

A named volume is managed by the daemon and has no such restriction — verified healthy in 12
seconds, with data surviving a stop/start cycle and `down -v` discarding it.

**Consequences**: the `mongo_data/*` ignore rule becomes vestigial. It is harmless and left in
place. FR-006 and SC-006 are satisfied more strongly than planned: database files now live
outside the working tree entirely, so there is nothing for `git status` to report and no way
to stage them by accident.

**Alternatives considered**: keeping the bind mount and pre-creating the directory was tried
and failed as shown above. Running the container as the host user would sidestep the chown but
puts a platform-specific UID in a file every developer shares.

---

## R6 — Knowing when the database is ready

**Decision**: A container healthcheck running `mongosh --eval "db.adminCommand('ping')"`.

**Rationale**: The service retries a failed connection indefinitely and never finishes
starting, so a developer who starts it too early sees a hang with no error — the same
failure mode recorded in feature 002's Known Deviations. A healthcheck turns "is it up yet"
into something both a human and a script can read.

**Verified**: the probe container reported ready **1 second** after start, so waiting on
health costs nothing noticeable.

---

## R7 — Seeding the development administrator

**Decision**: The seeding logic lives in `src/users/`, exercised by a thin runner in
`scripts/`. It goes through the application's own user service and is idempotent.

**Where the logic lives matters.** Jest's `rootDir` is `src`, so a spec placed in `scripts/`
is never discovered and never runs. Putting the logic there would have produced a seed script
that looked tested and was not — a silent breach of Principle I. The logic therefore sits
beside the service that owns user creation, where it is discovered and covered; `scripts/`
keeps only the bootstrap.

**Rationale**: Two options exist, and only one respects the codebase.

A JavaScript file in the image's `docker-entrypoint-initdb.d` runs inside the database shell,
which cannot produce a bcrypt hash. It would have to write a pre-computed hash, duplicating a
business rule that `UsersService.create` already owns — precisely the layer bleed
Constitution II prohibits, and a rule that would silently drift the moment hashing changes.

Going through the service instead reuses the real hashing, the real schema defaults, and the
real `Role` enum. It also runs on demand rather than only on first initialisation, which is
what makes re-seeding an existing database possible.

**Alternatives considered**: `docker-entrypoint-initdb.d`, rejected above. A fixture loaded
by the test suite was also rejected — the suite uses its own throwaway database (R10) and
must not depend on local state.

---

## R8 — A fresh clone has no configuration at all

**Decision**: Commit **`env.example`** — no leading dot — and change nothing in `.gitignore`.

This is the second thing that would have derailed implementation. **`.env.local` is not
tracked**, so a new contributor has no local configuration whatsoever — no database name, no
credentials, nothing for compose to interpolate. SC-001's "clone, then three commands" is
impossible without a committed template, and the spec assumed a file that a fresh clone does
not have.

**Verified** against the current ignore rules:

| Candidate | Status |
|---|---|
| `.env.example` | **ignored** — caught by the existing `*.env.*` rule |
| `.env.local.example` | **ignored** — same rule |
| `env.example` (no leading dot) | committable |
| `.env.example` **with a `!.env.example` negation added** | committable — but see the rationale below; this option was rejected |

**Decision rationale**: the constitution states that "`.env*` files MUST remain untracked".
A dot-named template matches that pattern, so committing one would require either amending
the constitution or declaring an exception to it — and a rule with a quiet exception is a rule
that erodes. `env.example` does not match the pattern at all, so the conflict disappears
rather than being argued around.

It is also simply less machinery: no negation to add, no ordering requirement inside
`.gitignore`, and no way for a future reordering of that file to silently start ignoring the
template again.

The earlier draft of this decision chose the dot-named file with a negation, on the grounds
that it keeps the conventional name. That reasoning held right up until the constitution rule
was read against it; conventional naming is not worth an exception to a security rule.

---

## R9 — Making it one command

**Decision**: npm scripts wrapping the compose invocations — start, stop, reset, seed.

**Rationale**: FR-001 requires a single documented command, and R3 forces `--env-file
.env.local` onto every invocation. A script is also the natural place for the reset sequence,
which is two operations (stop the container, remove the data directory) that must happen in
order.

---

## R10 — Test isolation

**Finding, not a decision**: nothing is required. The suite starts its own in-memory MongoDB
on a random port through `mongodb-memory-server`, so it neither reads nor writes the local
database and cannot collide with it on port 27017. FR-013 and SC-007 are satisfied by the
existing design; the implementation simply must not change it.

---

## Summary

| ID | Decision | Serves |
|---|---|---|
| R1 | Database only in compose; service on the host | FR-002 |
| R2 | Pin `mongo:7` | FR-001 |
| R3 | Credentials interpolated from `.env.local`, no literals committed | FR-002, FR-014 |
| R4 | No connection changes needed — **verified**; keep the database out of the URI path | FR-002 |
| R5 | Named volume (bind mount reversed — fails on macOS); reset is `down -v` | FR-004, FR-005, FR-006 |
| R6 | Healthcheck via `mongosh` ping | FR-015 |
| R7 | Seed through the application's user service, idempotent | FR-007 – FR-011 |
| R8 | Commit `env.example`; no `.gitignore` change, no constitution exception | FR-001, SC-001, FR-014 |
| R9 | npm scripts wrap compose | FR-001, FR-005 |
| R10 | Test isolation already holds | FR-013, SC-007 |

**No unresolved NEEDS CLARIFICATION items remain.**

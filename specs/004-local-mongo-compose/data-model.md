# Phase 1 Data Model: Local MongoDB via Docker Compose

**Feature**: `specs/004-local-mongo-compose` | **Date**: 2026-09-18

## Scope note

This feature introduces **no schema change**. It provisions the storage the existing `User`
schema already expects and writes exactly one document through the application's own service.

What it does introduce is a configuration contract shared by two consumers that must not
drift, and one seeded record. Both are modelled here.

---

## Configuration values

The same file feeds two readers, which is the point: the container is initialised from the
values the application will later use to connect, so they cannot disagree.

| Key | Consumed by the container as | Consumed by the application as | Notes |
|---|---|---|---|
| `DB_USER` | `MONGO_INITDB_ROOT_USERNAME` | connection user | Created in `admin`, not in `DB_NAME` — see the authentication note below |
| `DB_PASS` | `MONGO_INITDB_ROOT_PASSWORD` | connection password | URL-encoded by the application before use |
| `DB_NAME` | `MONGO_INITDB_DATABASE` | `dbName` option | The working database |
| `DB_PORT` | published host port | URI port | `27017` by convention |
| `DB_HOST` | — | URI host | Always `localhost`; the container publishes to the host |
| `DB_DRIVE` | — | URI scheme | `mongodb` locally, not `mongodb+srv` |
| `DB_ARGS` | — | URI query string | `authMechanism=DEFAULT` |

Compose reads these by interpolation (`docker compose --env-file .env.local`), which was
verified to substitute correctly and to yield empty values without the flag. The flag is
therefore load-bearing, not optional.

### The authentication note

The root user is created in the `admin` database while the application works in `checklist`.
This succeeds **only because** the connection URI carries no database in its path, which
leaves the driver's authentication source defaulting to `admin`.

| URI shape | Result |
|---|---|
| `mongodb://host:port/?authMechanism=DEFAULT` + `dbName` option | authenticates |
| `mongodb://host:port/checklist?authMechanism=DEFAULT` | **fails** |
| `mongodb://host:port/checklist?...&authSource=admin` | authenticates |

Verified against a live container. This is a standing constraint on `database.module.ts`, not
a fact about this feature alone: moving the database name into the URI path breaks local
authentication, and the resulting message says only `Authentication failed`, which points a
reader at credentials rather than at the URI.

---

## The committed template

`env.example` mirrors the key set above with **placeholder values only**. The name has no
leading dot on purpose: the constitution requires `.env*` files to stay untracked, and a
dot-named template would both match the existing ignore rule and conflict with that rule.
`env.example` avoids the conflict rather than carving an exception into it.

| Requirement | Why |
|---|---|
| Every key the application validates at startup | A copied file must produce a service that starts, not one that fails on the next missing value |
| Placeholders, never real values | It is committed; a real credential here is a leaked credential |
| `NODE_ENV=local` | The value that keeps the documentation page served and the origin allowlist optional |
| No `CORS_ORIGINS` requirement | Optional outside a deployed environment, so a local copy need not set it |

---

## Seeded development administrator

One document, written through `UsersService.create` so it is indistinguishable from an
account created through the API.

| Field | Value | Source |
|---|---|---|
| `email` | a synthetic local address | the seed script |
| `name` | a recognisably non-real display name | the seed script |
| `password` | bcrypt hash | produced by `UsersService.create`, never written directly |
| `role` | `admin` | the `Role` enum, not a string literal |

### Constraints

- **Synthetic and local-only.** Must not match any credential used by a deployed
  environment. The constitution requires test data to be synthetic; this is the same rule.
- **Never stored as readable text.** Guaranteed by going through the service rather than
  writing the document directly — the same reason a database-side init script was rejected.
- **Idempotent.** Running the seed twice creates one account, not two, and fails on neither
  an empty nor an already-seeded database.
- **Non-destructive.** If the account already exists, the seed leaves it alone rather than
  resetting its password or role. A developer who has deliberately changed either should not
  have it silently undone.

### States

| Database state | Seed behaviour | Result |
|---|---|---|
| No account with that email | Create it | One administrator, sign-in works |
| Account already present | Leave untouched, report it | Unchanged; exit success |
| Present but not an administrator | Leave untouched, report it | Unchanged; exit success, with a warning that sign-in will work but admin routes will not |

The third row is deliberate. Silently promoting an account to administrator would be a
privilege change made by a tool the developer ran for a different reason.

---

## What is not modelled

No reservation, item, activity or configuration data is seeded. A single administrator is
what unblocks the API; representative domain data is a larger exercise with its own design
questions and is out of scope.

# Contract: Development Administrator Seed

**Feature**: `specs/004-local-mongo-compose` | Serves FR-007 – FR-011

## Why this exists

The API cannot bootstrap its own first administrator. Creating an account requires an
administrator (`POST /api/users` is restricted), and signing in requires an account that
already exists. On an empty database those two facts deadlock: every request is refused and
nothing can create the account that would unblock them.

Without this step the feature delivers a database that starts cleanly, reports healthy, and
is useless — a failure that reads as a broken application rather than an empty database.

## Invocation

```bash
pnpm db:seed
```

Runs against whatever `.env.local` points at. Requires the database to be reachable.

## Behaviour

| Database state | Action | Exit | Output |
|---|---|---|---|
| No account with the seed email | Create it as an administrator | success | Reports the account created and the credentials to sign in with |
| Account exists, is an administrator | None | success | Reports it already exists |
| Account exists, is **not** an administrator | None | success | Reports it exists without administrator rights, and that admin-only routes will refuse it |
| Database unreachable | None | failure | Names the connection problem, and that `pnpm db:up` must run first |

**Idempotent by contract.** Running it twice creates one account. This matters because it
sits in a documented setup sequence someone will re-run after a reset, after switching
branches, or simply because they forgot.

**Non-destructive by contract.** An existing account is never modified — not its password,
not its role. A developer who deliberately demoted the account or changed its password
should not have that silently undone by a tool they ran to set up a database. Promoting an
account to administrator is a privilege change, and doing it as a side effect would be
exactly the kind of implicit grant the authorization work in feature 001 removed.

## Implementation constraints

| Constraint | Reason |
|---|---|
| Must create the account through `UsersService` | Reuses the real hashing, schema defaults and `Role` enum. Writing the document directly would duplicate a business rule the service owns — the layer bleed Constitution II prohibits |
| Must never write a password as readable text | Guaranteed by the above; the service hashes |
| Must use the `Role` enum, not the string `'admin'` | A literal drifts the moment the enum changes |
| Credentials must be synthetic | The constitution requires synthetic test data. These are also printed to a terminal and committed in documentation |
| Must not match any deployed credential | FR-010 |
| Must not be a fixture the test suite depends on | The suite uses its own in-memory database and must not require local state |

## Why not a database-side init script

The image supports running JavaScript at first initialisation, which looks like the obvious
place for this. It cannot work: that script runs inside the database shell, which has no
bcrypt, so it would have to write a pre-computed hash — duplicating the hashing rule and
silently drifting the moment `SALT_ROUNDS` or the algorithm changes.

It also only runs when the data directory is empty, so it could never re-seed an existing
database, which the idempotency contract above requires.

## Test expectations

Unit-level, against a mocked user service — no database needed:

| Case | Expectation |
|---|---|
| Empty database | Calls create once, with the administrator role from the enum |
| Account already present | Does not call create; exits success |
| Account present without administrator rights | Does not call create; does not modify; exits success; warns |
| Password handling | The script never passes a hash; hashing is the service's job |
| Database unreachable | Exits non-zero naming the problem |

The idempotency cases are the ones worth having. A seed that silently creates duplicates on
its second run is the common failure, and it surfaces later as ambiguous sign-in behaviour
rather than as an obvious error.

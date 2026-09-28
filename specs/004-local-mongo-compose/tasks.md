---

description: "Task list for Local MongoDB via Docker Compose"
---

# Tasks: Local MongoDB via Docker Compose

**Input**: Design documents from `/specs/004-local-mongo-compose/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: **Required, not optional.** Constitution Principle I is NON-NEGOTIABLE: behaviour
must be covered by a test that fails before the implementation exists. The seed script is
behaviour and gets real tests. The compose file is configuration and gets verification steps
instead — a distinction the task list keeps explicit rather than pretending a YAML file has
unit tests.

**Organization**: Grouped by user story so each can be implemented and verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task serves (US1–US3)
- Exact file paths are given in every task

## Path Conventions

Single NestJS project at repository root. Unit specs are colocated beside their subject
**under `src/`** — jest's `rootDir` is `src`, so a spec placed anywhere else is silently never
run. This corrects the file layout in plan.md, which put the seed script and its spec in
`scripts/`; see the note in Phase 4.

---

## Phase 1: Setup

**Purpose**: Confirm the tooling this feature depends on, and record a known-good baseline so
any later failure is attributable to this work.

- [X] T001 Confirm a container runtime is available and running with `docker compose version` and `docker info`, then record the baseline by running all four gates — `pnpm lint:ci`, `NODE_ENV=local npm test -- --coverage`, `NODE_ENV=local pnpm test:e2e`, `pnpm build` — and confirm all four pass before any change

**Checkpoint**: Container runtime present, gates green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Make a fresh clone configurable. This phase genuinely blocks both user stories:
without a committed template there is nothing for compose to interpolate and nothing for a
new contributor to copy, so neither the database nor the seed can run.

**⚠️ No user story work can begin until this phase is complete.**

- [X] T002 Create `env.example` at the repository root containing every key the startup schema validates, with placeholder values that work unedited for a purely local run: `NODE_ENV=local`, `PORT`, `DB_DRIVE=mongodb`, `DB_HOST=localhost`, `DB_PORT=27017`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_ARGS=authMechanism=DEFAULT`, `SECRET`, `TANK_API_KEY`. No real credential, and no `CORS_ORIGINS` requirement since it is optional outside a deployed environment — per [data-model.md](./data-model.md). The name has **no leading dot**: the constitution requires `.env*` files to stay untracked, and a dot-named template would both match the existing ignore rule and conflict with that rule ([research.md](./research.md) R8)
- [X] T003 Verify the ignore rules behave as intended with **no change to `.gitignore`**: `git check-ignore -q env.example` must report it committable while `.env.local` and `.env.production` remain ignored

**Checkpoint**: A fresh clone can produce a working `.env.local` with one copy.

---

## Phase 3: User Story 1 - A developer gets a working local database in one command (Priority: P1) 🎯 MVP

**Goal**: One command provisions a database the service connects to, with no database engine
installed on the host and no configuration edits.

**Independent Test**: On a machine with no database engine, copy the template, run the start
command, start the service, and confirm `/api/health` reports the data store as available.

### Implementation for User Story 1

- [X] T004 [US1] Create `compose.yaml` at the repository root defining a single `mongo` service: image pinned to `mongo:7`, `MONGO_INITDB_ROOT_USERNAME`/`_PASSWORD`/`_DATABASE` interpolated from `${DB_USER}`/`${DB_PASS}`/`${DB_NAME}`, host port published from `${DB_PORT}`, a **named volume** for `/data/db` (not a bind mount — the image chowns that path and macOS file sharing refuses it on a host directory, verified to crash-loop), and a healthcheck running a database ping. **No credential literal** may appear in the file — per [contracts/local-environment.md](./contracts/local-environment.md)
- [X] T005 [US1] Add `db:up` and `db:down` scripts to `package.json`. Both must pass `--env-file .env.local`, which is load-bearing: without it compose interpolates empty values ([research.md](./research.md) R3). `db:up` must wait for the container healthcheck rather than returning as soon as the container is created
- [X] T006 [US1] Add a comment in `database.module.ts` at the URI construction site recording that the database name must stay **out** of the URI path, because that is what leaves the driver's authentication source defaulting to `admin` where the root user lives. Moving it into the path breaks authentication with a message that says only `Authentication failed` — verified, see [research.md](./research.md) R4

### Verification for User Story 1

- [X] T007 [US1] Verify a fresh start: from no running container, `pnpm db:up` succeeds and `curl localhost:3000/api/health` returns `{"status":"ok","database":"up"}` once the service is started (quickstart Scenario 1)
- [X] T008 [US1] Verify `pnpm db:up` is idempotent: running it while already up succeeds and leaves existing data intact (FR-003)
- [X] T009 [US1] Verify a port conflict surfaces clearly: with something already bound to the configured port, `pnpm db:up` fails naming the conflict rather than appearing later as a connection error from the service

**Checkpoint**: A database exists and the service reaches it. **Do not stop here** — see the warning in Implementation Strategy.

---

## Phase 4: User Story 2 - The local environment can actually be signed into (Priority: P1)

**Goal**: A developer with a freshly provisioned database can sign in and exercise
administrator-only endpoints.

**Independent Test**: Against a fresh database, sign in with the documented credentials and
call an admin-only endpoint successfully, with no manual database manipulation.

> **Layout correction.** plan.md placed the seed script and its spec in `scripts/`. Jest's
> `rootDir` is `src`, so a spec there never runs — the script would appear tested while being
> entirely uncovered. The seeding **logic** therefore lives under `src/users/`, where it is
> discovered, covered, and sits beside the service that owns user creation. `scripts/` keeps
> only a thin runner that boots the application context.

### Tests for User Story 2

> Write these first and confirm they fail before implementing. Mocked user service — no
> database required.

- [X] T010 [P] [US2] Unit spec in `src/users/dev-admin-seed.spec.ts`: against an empty database the seed calls create exactly once, with the administrator role taken from the `Role` enum rather than a string literal
- [X] T011 [P] [US2] Extend `src/users/dev-admin-seed.spec.ts`: when the account already exists the seed does **not** call create and still exits successfully — the idempotency contract, and the failure that would otherwise surface later as ambiguous sign-in behaviour
- [X] T012 [P] [US2] Extend `src/users/dev-admin-seed.spec.ts`: when the account exists **without** administrator rights the seed modifies nothing, exits successfully, and reports that admin-only routes will refuse it. Silently promoting it would be a privilege change made by a tool run for another purpose — see [contracts/seed-account.md](./contracts/seed-account.md)
- [X] T013 [P] [US2] Extend `src/users/dev-admin-seed.spec.ts`: the seed never passes a pre-hashed password; hashing stays the responsibility of the user service (FR-011)

### Implementation for User Story 2

- [X] T014 [US2] Implement `src/users/dev-admin-seed.ts` exporting a function that takes the user service and applies the behaviour table in [contracts/seed-account.md](./contracts/seed-account.md). It must create through `UsersService` rather than writing the document directly, so hashing, schema defaults and the `Role` enum are reused rather than reimplemented (Constitution II)
- [X] T015 [US2] Implement `scripts/seed-dev-admin.ts` as a thin runner: boot the application context, resolve the user service, call the function from T014, print the credentials to sign in with, and exit non-zero with a clear message when the database is unreachable — naming `pnpm db:up` as the fix
- [X] T016 [US2] Add a `db:seed` script to `package.json` invoking the runner from T015
- [X] T017 [US2] Add a `db:setup` script to `package.json` running `db:up` then `db:seed`. This is what makes SC-001's three-command budget achievable — without it the shortest honest path is four commands and the criterion cannot be met

### Verification for User Story 2

- [X] T018 [US2] Verify quickstart Scenario 2: sign in with the seeded credentials, then call an administrator-only endpoint with the returned token and confirm 200. No manual database manipulation at any point
- [X] T019 [US2] Verify quickstart Scenario 3: run `pnpm db:seed` twice, confirm the second run reports the account already exists, and confirm exactly one matching account exists in the database

**Checkpoint**: The environment is usable, not merely running.

---

## Phase 5: User Story 3 - Local data persists, and can be deliberately discarded (Priority: P2)

**Goal**: Data survives restarts, and one documented command discards it.

**Independent Test**: Write a record, restart the database, confirm it survives; then reset
and confirm a clean database.

- [X] T020 [US3] Add a `db:reset` script to `package.json` that stops the container and removes its named volume (`docker compose down -v`)
- [X] T021 [US3] Verify persistence: write a record, `pnpm db:down`, `pnpm db:up`, and confirm the record is still present (quickstart Scenario 4)
- [X] T022 [US3] Verify reset: `pnpm db:reset`, then `pnpm db:setup`, and confirm a clean database in which the first sign-in works again
- [X] T023 [US3] Verify `git status --porcelain` reports nothing database-shaped once data exists. With a named volume the files sit outside the working tree entirely, so FR-006 and SC-006 hold by construction rather than by an ignore rule

**Checkpoint**: Data behaves predictably across sessions.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T024 Document the setup path in `README.md`: the copy-template-then-three-commands sequence, and **the ordering rule** — the database must be healthy before the service starts. State the symptom of getting it wrong, because the service hangs rather than erroring and a developer will otherwise read it as a broken application (FR-015)
- [X] T025 Verify the documented failure mode by rehearsing quickstart Scenario 5: stop the database, start the service, confirm it hangs with no route answering, and confirm the README says so
- [X] T026 Verify isolation and cleanliness via quickstart Scenario 6: all four gates pass; the end-to-end suite produces identical results with the local database running and stopped; and `compose.yaml` contains interpolation rather than credential literals while `env.example` contains placeholders only. Also confirm the seeded credentials match nothing in `.env.production` (FR-010), which no other task verifies
- [X] T027 Confirm coverage after adding `src/users/dev-admin-seed.ts` via `NODE_ENV=local npm test -- --coverage`: `src/auth/**` must hold its 90% floor, and record the overall figure against the constitution's **80%** floor. The project currently sits at ~70% and the jest config enforces only the `src/auth` threshold, so this gap is pre-existing — report it rather than restating a weaker bar
- [X] T028 Run the full quickstart end to end (Scenarios 1–6) on a clean checkout, **timing Scenario 1 and counting its commands** against SC-001's budget of under 5 minutes and no more than 3 and record the result in the pull request description, naming which constitution principles this change touches as the workflow rules require

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: blocks everything — no template means nothing to interpolate
- **US1 (Phase 3)**: after Phase 2. Independently shippable
- **US2 (Phase 4)**: after US1, since there is nothing to seed before a database exists
- **US3 (Phase 5)**: after US1; verifies the bind mount US1 introduces
- **Polish (Phase 6)**: after the stories being shipped

### Within Each User Story

- Tests are written and failing before the implementation they cover (US2)
- Configuration before the scripts that invoke it
- Implementation before its verification tasks

### Parallel Opportunities

| Group | Tasks | Why safe |
|---|---|---|
| US2 test authoring | T010–T013 | One new spec file; treat as a single unit if authored concurrently |
| Nothing else | — | This feature is small and mostly sequential: `package.json` is touched by T005, T016 and T020, and `compose.yaml` gates every verification step |

**Never parallel**: T005, T016, T020 — all three edit `package.json`.

---

## Parallel Example: User Story 2

```bash
# Author the seed specs together (one file, four cases):
Task: "empty database -> creates once with Role.ADMIN"
Task: "account exists -> does not create"
Task: "account exists without admin rights -> does not modify, warns"
Task: "never passes a pre-hashed password"
```

---

## Implementation Strategy

### MVP (Setup + Foundational + US1)

1. Phase 1, then Phase 2
2. Phase 3
3. **Stop and validate**: quickstart Scenario 1

**Warning before calling the MVP done.** US1 alone provisions a database that the service
connects to — and then refuses every useful request, because no account exists and the API
cannot create its own first administrator. The result looks like a broken application rather
than an empty database. US2 is a co-requisite, not a follow-up; do not ship US1 on its own
and expect anyone to be unblocked.

### Incremental delivery

1. Setup + Foundational → a clone can be configured
2. US1 → a database exists and the service reaches it
3. US2 → the environment is actually usable
4. US3 → data behaves predictably across sessions
5. Polish → documentation, isolation checks, full quickstart

### Out of scope

The `docker/Dockerfile` targets a serverless deployment platform and is untouched here. It
does pin Node 18 against the project's declared 24.x, which is worth correcting in its own
change.

---

## Notes

- `[P]` means different files with no dependency on incomplete work
- Test tasks are mandatory, not optional — Constitution Principle I is non-negotiable
- Verification tasks are distinct from tests: configuration is verified, behaviour is tested
- Commit after each task or logical group; the branch merges by pull request

# Research: Accurate, Exported API Contract

**Feature**: `specs/005-openapi-contract-export` | **Date**: 2026-09-28

Every finding marked **Observed** was produced by running something on 2026-09-28, not by
reading the source. The project guidance requires this, because several routes do not do
what their code appears to do.

---

## R1. Generating the document without a database (FR-009)

**Decision**: Build the document from the compiled application using Nest's **preview
mode** (`NestFactory.create(AppModule, { preview: true, abortOnError: false })`), with
fixed placeholder configuration, then call `SwaggerModule.createDocument`. No database,
network listener, or real secret is involved.

**Observed**:
- With `DB_HOST=unreachable.invalid` and placeholder values for every required variable,
  preview mode produced a document of **38 operations that is byte-identical** to the
  `/docs-json` served by a running instance with a live database.
- Preview mode resolves the module graph without instantiating providers, so the Mongoose
  connection, and the Mongo-backed throttler storage, are never opened.

**Rationale**: It generates the document from the real `AppModule`, so there is no second,
hand-maintained module list that could drift from what ships. By contrast, the e2e
`createTestApp` in `test/security/app-factory.ts` mirrors `AppModule` by hand.

**Alternatives considered**:
- *Boot the app against `mongodb-memory-server`*. It works, but it downloads and starts a
  mongod just to read decorator metadata. Rejected: it breaks "no database" in spirit, and
  it is slow.
- *Mock `MongooseModule`*. It needs a parallel module tree. Rejected for the same drift
  reason as `createTestApp`.

---

## R2. The Swagger CLI plugin only runs in `nest build` (FR-001–FR-004, FR-013)

**Observed**: `nest-cli.json` enables `@nestjs/swagger/plugin`. The plugin rewrites DTO
and entity classes at compile time to add their property metadata. It runs in `nest
build` and `nest start`, but **not** under ts-jest or ts-node. A document generated from
code compiled any other way is missing most request-body properties.

**Decision**: The contract is always generated from **`nest build` output**
(`dist/`). The exporter is a file under `src/` so the build compiles it with the plugin,
and `docs:export` runs the build first.

**Consequence for the drift check**: it cannot be a jest test that generates the document
in-process, because that compilation would lack the plugin and differ from what ships.
Adding the plugin to ts-jest (`astTransformers`) was considered and rejected. It creates
a second compilation path that must match the first, which is the drift this feature
exists to remove.

---

## R3. Where the checks run (FR-013, FR-014, FR-015)

**Decision**: Split by what each check needs.

| Check | Runs | Reads | Why there |
|---|---|---|---|
| Drift (FR-013) | `pnpm docs:check`, a new CI step directly after **Build** | freshly built `dist/` vs committed `openapi.json` | needs plugin-compiled output (R2) |
| Completeness (FR-014) | e2e gate, `test/docs/` | committed `openapi.json` | pure JSON inspection, no app boot |
| Matrix agreement (FR-015, refusals) | e2e gate, `test/docs/` | committed `openapi.json` + `AUTHORIZATION_MATRIX` | pure data comparison |
| Execution proof (FR-015, sample + discrepancies) | e2e gate, `test/docs/` | committed `openapi.json` + running app | needs a real instance |

**Rationale**: The drift check guarantees that committed JSON equals generated JSON. So
every other check can safely read the committed file, and none of them needs the plugin.
The completeness and matrix checks become millisecond-fast JSON assertions. They sit in
the e2e gate, not the unit gate, because the unit config only collects `src/**/*.spec.ts`,
while `test/` (where `AUTHORIZATION_MATRIX` lives) belongs to the e2e config. This also
makes CLAUDE.md's "`test/docs/` enforces this" literally true.

**CI**: `docs:check` is folded into the existing **Build** step (`pnpm build && pnpm
docs:check`), so the number of gates stays at five, as the constitution names them. The
build runs once.

---

## R4. Determinism across machines (FR-010)

**Decision**:
- Serialize with `JSON.stringify(doc, null, 2)` plus a trailing newline. Keys keep the
  generator's order.
- Add `.gitattributes` with `openapi.json text eol=lf`, so a Windows checkout with
  `core.autocrlf` cannot turn a clean tree into a failing drift check.
- Add `openapi.json` to `.prettierignore`, so formatting tools never rewrite generated
  output.
- The exporter pins its own placeholder configuration and does not read `.env.*` values.
  Nothing environment-specific can reach the document.

**Observed**: two consecutive preview-mode runs produced identical output. Operation order
follows the module import order, which is fixed in code.

**Alternatives considered**: recursively sorting keys. Rejected: it reorders paths away
from the grouping readers expect, and generation order is already stable.

---

## R5. Documenting refusals, and making `@ApiRefusals` real (FR-005, FR-014, FR-016)

**Observed**:
- `@ApiRefusals` does not exist, and neither does `test/docs/`, although CLAUDE.md
  describes both.
- The guards produce exactly these statuses:
  - `JwtAuthGuard`: **401** for any non-public route without a valid token.
  - `RolesGuard`: **403** when the caller lacks the role.
  - `ApiKeyGuard`: **401** only, never 403.
  - Sign-in: **401** for bad credentials, and **429** from the persisted throttler.
- The access-matrix e2e suite already proves 401 for every non-public route, and 403 for
  every admin route called by a non-admin.

**Decision**: add one decorator, `@ApiRefusals(...statuses)`, in
`src/common/decorators/`. It applies the standard response documentation for each listed
status (400, 401, 403, 404, 429), each with a fixed description and the shared error body
schema.
- Access refusals are listed explicitly on each route, not inferred. The unit-gate matrix
  check then asserts they agree with `AUTHORIZATION_MATRIX`:
  - `auth` → 401
  - `admin` → 401 and 403
  - `device` → 401 only
  - `public` → neither
- A route that validates input also lists 400, and 404 is listed only where the route
  really produces it (R7).

**Alternatives considered**: `@ApiAccess(level)`, which derives refusals from the access
level. Rejected: it duplicates the guard metadata in a third form, and it cannot express
400, 404 or 429. Listing statuses explicitly and checking them against the matrix keeps
one source of truth, the matrix, with a test tying the two together.

---

## R6. Response shapes without changing responses (FR-004, FR-008, FR-012)

**Observed**:
- `GET /api/users/all` returns stored records with `_id, email, name, role, createdAt,
  updatedAt, __v`. The password is **not** included.
- Missing user: 404. Missing item: **200 with an empty body**.

**Decision**: add **documentation-only response classes** (`*-response.dto.ts`) in each
module, describing the fields actually returned, `_id` and `__v` included. They are
referenced by `@ApiOkResponse` / `@ApiCreatedResponse` (`type: X` or `type: [X]`). They
are never used to transform a response, so runtime behaviour is unchanged (FR-012). The
Swagger plugin fills in their properties from the TypeScript types.

**Why not the entity classes**: they include `password`, so documenting them would put a
credential field in the contract (FR-008).

**Constitution note**: Principle II requires responses to be *projected* through DTOs.
Today they are not, and this feature documents rather than fixes that (discrepancy D3).
The response classes introduced here are the shapes a later projection feature can adopt
unchanged.

---

## R7. Establishing real statuses per route (FR-005, FR-006)

**Decision**: statuses other than the access refusals are established per module by a
short observation pass against the local Compose database from feature 004, before
documenting them. Each observation is recorded in `discrepancies.md` whenever it
contradicts the code's apparent intent. The known cases so far:

| # | Operation | Observed | Apparent intent |
|---|---|---|---|
| D1 | `GET /api/users/all` (and every `limit`/`offset` list) | 400 when `limit` or `offset` is omitted | defaults of 10 / 0 |
| D2 | `GET /api/items/:id` with an unknown id | 200, empty body | 404 |
| D3 | all record-returning routes | stored fields incl. `__v` returned raw | projected DTO (Principle II) |
| D4 | list routes | query values bound one by one with `ParseIntPipe` | typed query DTO (Principle IV) |

**Rationale**: the spec requires real behaviour, and project guidance warns that by-id
routes contradict their code. Reading `throw new NotFoundException` is not evidence.

---

## R8. Sign-in request body (FR-002)

**Observed**: `POST /api/login` has no documented body. Credentials are read by the
Passport local strategy, not bound through `@Body()`.

**Decision**: document the body with `@ApiBody({ type: LoginRequestDto })`, a
documentation class with `email` and `password`. Binding stays with Passport, so
validation and behaviour do not change. The success response (`access_token` plus
`user { email, id, role }`, observed) gets a response class too.

---

## R9. Export performance (SC-004)

**Observed**: 77 s end to end on this machine, of which 55 s is `require()` of the
compiled app and its dependencies. The repository sits on `/mnt/c`, the Windows
filesystem mounted into WSL, which is slow for many small files. Nest's own work
(preview + document) takes a few seconds.

**Decision**: SC-004 ("under one minute") is measured on CI's native Linux filesystem.
Local runs from `/mnt/c` will be slower; that is a property of the checkout location, not
of this feature. The quickstart notes that cloning into the WSL home directory is much
faster.

---

## R10. Coverage floor

**Decision**: the exporter's entry file (`src/openapi/export.ts`) is excluded from
coverage like `main.ts`. It is process glue that the drift check exercises end to end.
The shared document builder (`src/openapi/openapi-document.ts`) is covered by unit
tests. `src/auth/**` is untouched, so its 90% floor is unaffected.

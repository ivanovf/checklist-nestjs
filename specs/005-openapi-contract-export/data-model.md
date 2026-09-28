# Data Model: Accurate, Exported API Contract

**Feature**: `specs/005-openapi-contract-export`

This feature stores nothing in the database. Its "data" is the contract document and
the rules that tie it to the code and to the access matrix.

---

## Contract document

| Attribute | Rule | Source |
|---|---|---|
| Path | `openapi.json` at the repository root | FR-009 |
| Format | OpenAPI 3.0 JSON, 2-space indent, trailing newline, LF line endings | FR-010, R4 |
| Producer | `pnpm docs:export`, from `nest build` output in preview mode | R1, R2 |
| Info | title `Checklist API`, version `1.0`, same builder as the served `/docs` | R1 |
| Operations | exactly the routes the app registers: 38 at time of writing | FR-001 |
| Secrets | none. The exporter pins placeholder config and reads no `.env*` | FR-009 |

**Invariant**: committed file == file generated from the current code. This is enforced
by `pnpm docs:check` (FR-013).

## Operation

Keyed by `method + path` (for example `get /api/users/{id}`). This maps 1:1 to an
access-matrix row, with `{id}` in the document corresponding to `:id` in the matrix.

| Field | Required | Rule |
|---|---|---|
| `tags` | yes | exactly one group (FR-007) |
| `summary` | yes | non-empty, one line (FR-007) |
| `parameters` | when read | every path, query and header value the route reads. `required` reflects observed behaviour (FR-003) |
| `requestBody` | when a body is read | schema names every field, type and required status, including sign-in (FR-002) |
| success response | yes | exactly one 2xx, with a non-empty description and either a schema or an explicit empty body (FR-004) |
| refusal responses | see below | each with a non-empty description and the shared error schema (FR-005) |
| `security` | non-public | bearer for `auth`/`admin`, API key for `device` |

### Refusal set (per operation)

The union of the three rows below. Nothing outside it may be documented (FR-006).

| Source | Statuses | Rule |
|---|---|---|
| Access level (from matrix) | `public` → none · `auth` → 401 · `admin` → 401, 403 · `device` → 401 | **must match exactly**. Checked against `AUTHORIZATION_MATRIX` |
| Input validation | 400 | only where the route validates a body, query or param |
| Route-specific | 404, 429 | only where observed: 404 per R7, 429 on sign-in only |

A `public` operation with no validation and no route-specific refusal may have an empty
refusal set. `GET /api` and `GET /api/health` are the expected cases. Health documents
503, which is a documented non-2xx *outcome*, not a refusal.

## Response shape classes

These are documentation-only classes; they never transform a response (FR-012).

| Class | Describes | Notable fields |
|---|---|---|
| `<Entity>ResponseDto` (one per module) | a stored record as returned | `_id`, the entity's fields, `createdAt`, `updatedAt`, `__v`. Optional where older records may lack a field |
| `LoginRequestDto` | sign-in body | `email`, `password` |
| `LoginResponseDto` | sign-in result | `access_token`, `user { email, id, role }` |
| `ErrorResponseDto` | every refusal body | `statusCode`, `message` (string or string[]), `error` |

**Rule (FR-008)**: no response class declares `password` or any hash, token secret, or
key. `access_token` in `LoginResponseDto` is the one deliberate exception: it is the
point of the operation.

## Discrepancy entry (`discrepancies.md`)

| Field | Content |
|---|---|
| ID | `D<n>`, stable once assigned |
| Operation(s) | method + path, or a named group ("all list routes") |
| Observed | status and body shape seen when running it, with the date |
| Apparent intent | what the code or the constitution suggests should happen |
| Evidence | the e2e test in `test/docs/` that proves the observed behaviour (FR-015) |
| Principle | constitution principle it deviates from, if any |
| Issue | the GitHub issue number tracking the fix, one issue per entry |

Initial entries: D1–D4 from research R7.

## Access matrix (existing, unchanged)

`test/security/authorization-matrix.ts`: 38 rows of `{ method, path, access }`. It is
read, never modified, by this feature's checks. It stays the single source of truth for
the 401 and 403 statuses documented on each operation.

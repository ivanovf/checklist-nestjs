# Contract: Endpoint Documentation Conventions

**Feature**: `specs/005-openapi-contract-export` | Serves FR-002–FR-008, FR-014, FR-016

These are the rules every route follows. The checks in `test/docs/` (see [Checks](#checks))
enforce them against the committed `openapi.json`.

## Per-route decorators

| Need | Decorator | When |
|---|---|---|
| Group | `@ApiTags('<Group>')` | on every controller |
| Summary | `@ApiOperation({ summary })` | on every route |
| Success | `@ApiOkResponse` / `@ApiCreatedResponse` with `type` and `description` | on every route. Use `type: [X]` for lists. For an empty body, give a description stating it and no `type` |
| Refusals | `@ApiRefusals(...statuses)` | on every route with a non-empty refusal set |
| Query/header values | `@ApiQuery` / `@ApiHeader` | when a value is read without a typed DTO. `required` states **observed** behaviour |
| Body not bound by `@Body()` | `@ApiBody({ type })` | sign-in only (Passport reads it) |
| Auth scheme | `@ApiBearerAuth()` / `@ApiSecurity('api-key')` | non-public routes |

## `@ApiRefusals(...statuses)`

- Lives in `src/common/decorators/api-refusals.decorator.ts`.
- Accepts only `400 | 401 | 403 | 404 | 429`. Anything else is a compile error.
- Each status gets a fixed description and the `ErrorResponseDto` schema:

| Status | Description |
|---|---|
| 400 | The request body, query or path value is invalid. |
| 401 | No valid credentials were supplied. |
| 403 | The caller is signed in but lacks the required role. |
| 404 | No record exists with the given identifier. |
| 429 | Too many attempts; retry later. |

The access-level statuses to list per route are fixed by the matrix:
`auth` → `401` · `admin` → `401, 403` · `device` → `401` · `public` → none.

## Checks

E2E gate (`pnpm test:e2e`, `test/docs/`), data-only: they read the committed
`openapi.json`, which `docs:check` guarantees is current, and never boot the app:

1. **Coverage of routes**: document operations == `AUTHORIZATION_MATRIX` rows, both
   directions (FR-001).
2. **Completeness**: every operation has a tag, a summary, exactly one 2xx with a
   non-empty description, and either a schema or an explicitly described empty body.
   Every documented status has a non-empty description (FR-004, FR-007, FR-014).
3. **Access agreement**: each operation's {401, 403} subset equals the matrix-derived set
   exactly (FR-005, FR-015). One named exception: `post /api/login` is public but
   documents 401, because the local strategy refuses bad credentials (observed; R5).
4. **Allowed statuses**: every documented status belongs to
   `{2xx, 400, 401, 403, 404, 429, 503}`, 429 only on sign-in, 503 only on health (FR-006).
5. **No credentials**: no response schema, directly or through `$ref`, has a property
   named `password` (FR-008).

E2E gate, against a running app, per FR-015 option B:

6. **Sample conformance**: sign-in plus one operation per access level. The real
   response status and body keys match the contract.
7. **Discrepancy proof**: one test per `discrepancies.md` entry reproduces the observed
   behaviour. If a later feature fixes the behaviour, the test fails, prompting that
   feature to update the contract and the register together.

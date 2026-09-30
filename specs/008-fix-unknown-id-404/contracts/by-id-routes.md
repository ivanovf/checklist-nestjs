# Contract: the 20 by-id operations

**Feature**: `specs/008-fix-unknown-id-404` | Source of truth after merge: `openapi.json`

Access rules, request bodies and success bodies are unchanged. The error body keeps the
existing Nest shape.

| Operation | Access | Unknown id: before → after | Malformed id: before → after | Documented after |
|---|---|---|---|---|
| GET /api/users/:id | auth | 404 → 404 | 500 → **400** | 200, 400, 401, 404 |
| PUT /api/users/:id | auth | 404 → 404 | 500 → **400** | 200, 400, 401, 404 |
| DELETE /api/users/:id | admin | 404 → 404 | 500 → **400** | 200, 400, 401, 403, 404 |
| GET /api/items/:id | auth | 200 empty → **404** | 500 → **400** | 200, 400, 401, 404 |
| PUT /api/items/:id | admin | 200 empty → **404** | 500 → **400** | 200, 400, 401, 403, 404 |
| DELETE /api/items/:id | admin | 200 `{deleted}` → **404** | 200 `{deleted}` → **400** | 200, 400, 401, 403, 404 |
| GET /api/reservations/:id | auth | 200 empty → **404** | 500 → **400** | 200, 400, 401, 404 |
| PUT /api/reservations/:id | auth | 200 empty → **404** | 500 → **400** | 200, 400, 401, 404 |
| DELETE /api/reservations/:id | admin | 200 `{deleted}` → **404** | 200 `{deleted}` → **400** | 200, 400, 401, 403, 404 |
| GET /api/locks/:id | auth | 200 empty → **404** | 500 → **400** | 200, 400, 401, 404 |
| PUT /api/locks/:id | admin | 200 empty → **404** | 500 → **400** | 200, 400, 401, 403, 404 |
| DELETE /api/locks/:id | admin | 200 `{deleted}` → **404** | 200 `{deleted}` → **400** | 200, 400, 401, 403, 404 |
| PUT /api/config/:id | admin | 200 empty → **404** | 500 → **400** | 200, 400, 401, 403, 404 |
| PATCH /api/config/:id | device | 200 empty → **404** | 500 → **400** | 200, 400, 401, 404 (a wrong key is also 404, D10) |
| GET /api/activity/:id | auth | 404 → 404 | 500 → **400** | 200, 400, 401, 404 |
| PUT /api/activity/:id | auth | 200 empty → **404** | 500 → **400** | 200, 400, 401, 404 |
| DELETE /api/activity/:id | admin | 404 → 404 | 500 → **400** | 200, 400, 401, 403, 404 |
| GET /api/activity-type/:id | admin | 200 empty → **404** | 500 → **400** | 200, 400, 401, 403, 404 |
| PUT /api/activity-type/:id | admin | 200 empty → **404** | 500 → **400** | 200, 400, 401, 403, 404 |
| DELETE /api/activity-type/:id | admin | 200 empty → **404** | 500 → **400** | 200, 400, 401, 403, 404 |

The "Access" column comes from `test/security/authorization-matrix.ts`. It was checked on
2026-09-30 against the matrix and the 403s currently documented, and all 20 rows agree.

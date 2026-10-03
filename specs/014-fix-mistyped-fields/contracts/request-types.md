# Contract: Field Kinds Are Enforced on Every Request Body

**Feature**: `specs/014-fix-mistyped-fields` | Serves FR-001–FR-011

## What the published contract says

`openapi.json` is **unchanged** by this feature (R6, `pnpm docs:check` on the spike). It
already declares:
- the kind of every body field (`type: string | number | boolean | array`, `format: date-time`
  for dates);
- **400** "The request body, query or path value is invalid." on all 16 operations with a
  validated body;
- no 500 anywhere.

What changes is that the running API now keeps that promise. `pnpm docs:check` stays in the
gates. If a decorator change alters a schema, the export is regenerated and committed in the
same PR.

## Operations covered

| Operation | Create/change | Notes |
|---|---|---|
| `POST /api/items`, `PUT /api/items/:id` | both | |
| `POST /api/reservations`, `PUT /api/reservations/:id` | both | nested `items[]` too |
| `POST /api/locks`, `PUT /api/locks/:id` | both | numbers no longer accepted as codes |
| `POST /api/activity-type`, `PUT /api/activity-type/:id` | both | |
| `POST /api/activity`, `PUT /api/activity/:id` | both | |
| `POST /api/config`, `PUT /api/config/:id` | both | |
| `PATCH /api/config/:id` | device reading | D10 unchanged |
| `POST /api/users`, `PUT /api/users/:id` | both | D9, D12, D13 and D16 unchanged |
| `POST /api/password-recovery/complete` | n/a | rules from spec 012 unchanged |

`POST /api/login` is not covered: Passport reads its body, and it answers 401 (R6).

## Before → after

| Request | Before (observed 2026-10-02) | After |
|---|---|---|
| An object for a text field (`label: {…}`) | **500** | **400** `label must be a string` |
| Text or a number for yes/no (`status: "abc"`, `7`) | **500** | **400** `status must be a boolean value` |
| Text `"false"` for yes/no | 201, stored `false` | **400** |
| `true` for a date | **500** | **400** `dateIni must be a date in ISO 8601 format` |
| A number for a date (`7`) | 200, stored 1970-01-01 | **400** |
| An impossible date (`2026-02-30`) | 200, stored 2 March (derived in R3, not run on the API) | **400** |
| A non-date ISO form (`20260101`, `2026-W01`) | 400 (derived in R3, not run on the API) | 400 (message changes) |
| Text, an object or a list for `cost` | **500** | **400** `cost must be a number…` |
| A number or yes/no for a text field (`label: 7`) | 200, stored `"7"` | **400** |
| `true` for a number (`budget: true`) | 200, stored `1` | **400** |
| A number for a lock code (`lock: 1234`) | 200, stored `"1234"` | **400** `lock must be a string` |
| `changePassword: "abc"` | 200, read as yes | **400** |
| `null` for a required field on change (`label: null`) | 200, stored empty | **400** |
| `null` for a nullable field on change (`cost`, `userLock`, `description`) | 200 | 200, unchanged |
| An object nested in a reservation entry (`items[0].label: {…}`) | **500** | **400** `items.0.label must be a string` |
| A wrong type plus an undeclared field | 400 for the field, or 500 | **400** naming both |
| Any correctly typed request | as today | as today |

## Unchanged on purpose

- The reservation availability refusal, D10's 404 for a well-typed wrong device key, D12's 500
  for an unknown text role, D13's duplicate emails, D9's full-body account change, and D16's
  406.
- Queries: still converted from text and checked by their route pipes (specs 007, 010, 011).
- Lock codes like `"12ab"`: accepted as today. This is a format rule, proposed as D18 (R4).

# Phase 1 Data Model: Vercel Deployment Configuration

**Feature**: `specs/002-fix-vercel-deploy` | **Date**: 2026-09-17

## Scope note

This feature introduces **no persistent entity, no collection, and no schema change**. The
only Mongoose interaction it adds is a read of the existing connection's state for health
reporting; no document is queried, created, or projected.

What it does introduce is configuration inputs and one response shape, so those are modelled
here in place of entities.

---

## Configuration values

These are read through the validated configuration layer, never from `process.env`
directly, so that nothing consumes a value that has not passed startup validation.

| Key | Type | Local | Deployed | Validation | Consumed by |
|---|---|---|---|---|---|
| `CORS_ORIGINS` | comma-separated absolute origins, or the literal `none` | optional | **required** | non-empty; either `none` or entries that are syntactically valid absolute origins (scheme + host, no trailing path) | transport setup (FR-012, FR-013) |
| `NODE_ENV` | enum: `local` \| `production` | required | required | already validated by the existing schema | documentation gating (FR-002a), CORS requiredness |

`CORS_ORIGINS` is **not new to the project** — feature 001's configuration contract already
defines it with exactly this shape and requiredness, including the intended startup failure
message. This feature implements that existing contract rather than defining a new one.

### Parsed form

`CORS_ORIGINS` reaches the transport layer as an ordered list of trimmed, non-empty origin
strings.

| Raw value | Parsed | Notes |
|---|---|---|
| `https://a.example,https://b.example` | `["https://a.example", "https://b.example"]` | ordinary case |
| `https://a.example, https://b.example` | `["https://a.example", "https://b.example"]` | surrounding spaces trimmed |
| `https://a.example,` | `["https://a.example"]` | trailing separator produces no empty entry |
| `none` | `[]` | no browser origin permitted; correct for a native-only client |
| `` (empty, deployed) | — | startup fails, naming the value |
| `'https://a.example'` (quoted) | — | startup fails; the platform does not strip quotes the way a local env file does, and a quoted origin is not a valid origin |

The quoted-value row is a real failure mode for this deployment, not a hypothetical: values
entered in the hosting dashboard are taken literally. It is listed as a spec edge case and
must be covered by a validation test.

---

## Health response shape

One new response body, returned by the health route.

| Field | Type | Values | Meaning |
|---|---|---|---|
| `status` | string | `ok` \| `error` | whether every checked dependency is available |
| `database` | string | `up` \| `down` | whether the data store connection is usable |

### State mapping

Derived from the installed driver's connection states
(`disconnected: 0, connected: 1, connecting: 2, disconnecting: 3, uninitialized: 99`):

| Connection state | `database` | `status` | HTTP status |
|---|---|---|---|
| `connected` (1) | `up` | `ok` | 200 |
| any other state (0, 2, 3, 99) | `down` | `error` | 503 |

Only `connected` counts as reachable. `connecting` is deliberately **not** treated as
success — reporting a service healthy while it is still establishing its connection is the
exact failure the health route exists to prevent.

The non-success HTTP status matters: FR-016 requires reporting unavailability rather than
success, so a 200 response carrying `database: "down"` would not satisfy it. Deploy
verification and any future uptime check read the status code.

### Disclosure constraint

The response carries these two labels and nothing else. Connection strings, credentials,
host names, and driver error text are excluded (FR-017); underlying errors belong in logs.
This is why the shape is a fixed label rather than a passthrough of driver state.

---

## Published static surface

Not a data model in the usual sense, but it is state the deployment exposes, and the
routing order makes its contents security-relevant.

| Path | Source | Served publicly | Reason |
|---|---|---|---|
| `/robots.txt` | `public/robots.txt` | yes, intentionally | Satisfies the platform's output-directory requirement with a file that is useful and shadows no application route |
| everything else | — | no | Only the declared output directory is published; repository files are not (FR-003) |

No `index.html` is published. Static files resolve before rewrites, so an `index.html` would
shadow `/` and stop it reaching the application — see [research.md](./research.md) R1 and R8.

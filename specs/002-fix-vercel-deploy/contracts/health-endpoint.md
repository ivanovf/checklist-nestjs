# Contract: Health Endpoint

**Feature**: `specs/002-fix-vercel-deploy` | Serves FR-016, FR-017, SC-002

## Route

```
GET /api/health
```

Sits under the existing global `api` prefix, alongside every other route. Carries the
explicit public marker, because authorization is default-deny and deploy verification runs
with no credential.

## Authorization

| Caller | Result |
|---|---|
| No credential | 200 or 503 — reachable, by design |
| Any credential | identical response; the route ignores identity |

Marked public deliberately and visibly, per Constitution III: the exception is declared at
the route rather than created by a gap in enforcement. It exposes no reservation, account,
or configuration data — only two availability labels.

## Responses

### 200 — healthy

```json
{ "status": "ok", "database": "up" }
```

### 503 — data store unreachable

```json
{ "status": "error", "database": "down" }
```

The status code, not the body, is the contract for automated checks. A 200 carrying
`database: "down"` would violate FR-016, which requires reporting unavailability rather
than success.

## State mapping

| Driver connection state | `database` | `status` | HTTP |
|---|---|---|---|
| `connected` | `up` | `ok` | 200 |
| `connecting` | `down` | `error` | 503 |
| `disconnected` | `down` | `error` | 503 |
| `disconnecting` | `down` | `error` | 503 |
| `uninitialized` | `down` | `error` | 503 |

`connecting` counts as unavailable. Reporting healthy while the connection is still being
established is precisely the false positive this route exists to eliminate.

## Prohibited in the response

Per FR-017, the body must never contain:

- connection strings, credentials, user names, host names, ports
- driver or Mongoose error messages, codes, or stack traces
- database or collection names

A reviewer should be able to confirm this by reading the response type: two string literal
unions and nothing else.

## Known limitation — cold start against a dead data store

Discovered during implementation. If the connection cannot be established at all, the
framework's database module retries and **application startup never completes**, so no
route is registered and the platform reports an invocation failure rather than a clean 503.
Verified: startup was still retrying after 40 seconds with an unroutable host.

So this route covers the case that matters operationally — an instance whose connection
drops or degrades after startup — and does **not** cover a cold start against an
already-unreachable store. Reaching the route at all is itself evidence that startup
succeeded.

Recorded in the spec's Known Deviations, and FR-016 and User Story 1's third acceptance
scenario are both scoped to the post-startup case accordingly.

## Performance

Reads the connection's in-process state. No query, no network round trip, so the route
cannot hang on an unreachable database and adds no measurable latency. A round-trip ping was
considered and rejected in [research.md](../research.md) R6 — it would make the health route
the slowest route and could itself time out, which is the opposite of useful.

## Swagger metadata

Tagged and documented with both response statuses, per Constitution IV. Note that the
browsable documentation page is not served from deployed environments (see
[transport-security.md](./transport-security.md)) — the metadata requirement is about the
document being accurate, not about publishing it.

## Test expectations

| Case | Expectation |
|---|---|
| Connection reports `connected` | 200, `{status: "ok", database: "up"}` |
| Connection reports `disconnected` | 503, `{status: "error", database: "down"}` |
| Connection reports `connecting` | 503 — not treated as success |
| Any unavailable state | Response body contains no host, credential, or driver text |
| No credential presented | Route is reachable (confirms the public marker is applied) |

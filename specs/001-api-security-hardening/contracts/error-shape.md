# Contract: Error Response Shape

**Feature**: `001-api-security-hardening` | **Date**: 2026-09-07

Every failure the service returns MUST use one shape, produced by a single global exception
filter (FR-021). This exists so that an error can never disclose how the service is built.

---

## Shape

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Reservation not found",
  "timestamp": "2026-09-07T12:34:56.789Z",
  "path": "/api/reservations/abc123"
}
```

| Field | Always present | Notes |
|---|---|---|
| `statusCode` | yes | Matches the HTTP status |
| `error` | yes | The standard reason phrase for that status |
| `message` | yes | A string, or an array of strings for validation failures |
| `timestamp` | yes | ISO 8601, UTC |
| `path` | yes | Request path, no query string — query strings can carry identifiers |
| `correlationId` | when available | Ties the response to a log entry without exposing detail |

Validation failures keep the array form the existing `ValidationPipe` produces, so current clients
that surface field-level messages are unaffected.

---

## Prohibited in any response body

- Stack traces.
- Data-store detail: driver messages, `CastError`/`ValidationError` text, collection or field
  names from duplicate-key errors, query fragments.
- File paths, module names, dependency names or versions.
- Any credential, token, password, or hash — including echoed back from the request.
- Whether an account exists (see [auth-endpoints.md](./auth-endpoints.md)).

## Status mapping

| Condition | Status | `message` |
|---|---|---|
| Payload fails validation | 400 | Field-level messages (array) |
| Payload contains unrecognised fields | 400 | Names the rejected fields, nothing more |
| Malformed identifier in path | 400 | Generic — **not** the driver's cast error |
| No or invalid credentials | 401 | Generic |
| Authenticated but insufficient role | 403 | Generic — does not state which role is required |
| Resource absent | 404 | Generic; must not distinguish "absent" from "not yours" |
| Duplicate on a unique field | 409 | Names the conflicting field, not the index or collection |
| Throttled | 429 | Includes `retryAfterSeconds` |
| Anything unrecognised | 500 | Fixed generic message; full detail goes to the log only |

The 500 case is the important one: any exception the filter does not recognise MUST become a
generic 500. Detail is written to the server log with the correlation id, never to the response.

## Protective response headers

FR-019 requires "the agreed set of protective response headers". This is that set. Every response,
including error responses, MUST carry it.

| Header | Value | Why |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Stops the browser guessing a content type and executing a response as script |
| `X-Frame-Options` | `DENY` | Blocks framing of API responses; there is no UI here that needs embedding |
| `Strict-Transport-Security` | `max-age=15552180; includeSubDomains` | Forces HTTPS for the deployed origins. Sent in deployed environments only |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | The API returns JSON, so nothing should ever load from it. The Swagger docs route is exempted and keeps Helmet's default policy |
| `Referrer-Policy` | `no-referrer` | Keeps resource identifiers in paths out of the `Referer` header on any onward navigation |
| `Cross-Origin-Resource-Policy` | `same-origin` | Prevents other origins reading responses as a subresource |
| `X-DNS-Prefetch-Control` | `off` | Helmet default; no reason to override |

These are Helmet's defaults apart from `Content-Security-Policy`, which is tightened because this
service returns JSON rather than documents, and `X-Frame-Options`, set to `DENY` rather than
`SAMEORIGIN`.

**Headers that MUST be absent** (FR-020):

| Header | Note |
|---|---|
| `X-Powered-By` | Express sets this by default; it must be disabled explicitly, Helmet does not always remove it |
| `Server` | Must not disclose a version. Where the platform sets it and it cannot be removed, that is recorded as a platform limitation rather than silently accepted |

## Verification

- Trigger each row above and assert the body matches the shape and discloses nothing from the
  prohibited list.
- Force an unexpected internal exception and assert the response is a generic 500 while the log
  holds the detail.
- Assert no response carries `x-powered-by` or any server-technology header (FR-020).

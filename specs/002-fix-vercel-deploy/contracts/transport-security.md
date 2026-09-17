# Contract: Transport Security

**Feature**: `specs/002-fix-vercel-deploy` | Serves FR-002a, FR-012, FR-013, FR-014, FR-015

All three controls here are applied in the **shared** transport setup
(`src/bootstrap.ts` → `configureApp`), not in an individual entry point. The service has
two entry points — the port listener and the serverless handler — and a control applied to
only one of them diverges silently between local and deployed behaviour. That divergence is
the reason the shared function exists.

---

## 1. Cross-origin allowlist (FR-012, FR-013)

**Entry state**: `app.enableCors()` with no arguments, which grants every origin.
Prohibited by Constitution III outside local development.

**Target**: origins come from the validated `CORS_ORIGINS` configuration value, parsed into
a list and passed as the allowed origins.

| Environment | `CORS_ORIGINS` | Behaviour |
|---|---|---|
| Deployed | **required**, a list | Only the listed origins are granted access |
| Deployed | **required**, `none` | No browser origin is granted access |
| Local | optional | Absent means local development origins work without configuration |

### `none` — for an API with no browser client

CORS is a browser mechanism. A native client (Flutter, React Native, Swift, Kotlin) sends
no `Origin` and enforces nothing, so the allowlist neither permits nor blocks it. For a
service consumed only by native clients, the honest configuration is `CORS_ORIGINS=none`:
no browser origin is granted access, and no placeholder origin is invented to satisfy a
required field.

It remains **required** — `none` is an explicit choice, so a forgotten variable is still a
startup failure rather than silently defaulting to deny-all. When a browser client is added
later (a reports page, say), its origin replaces `none` and no code changes.

Note what `none` does *not* do: it withholds the response header a browser needs, and
nothing more. The API still answers. CORS is not access control — the authentication and
role guards are. A native app, `curl`, or another server reaches the API regardless.

This reuses feature 001's existing configuration contract verbatim — comma-separated
absolute origins, optional locally, required in production, with the startup message
`CORS_ORIGINS is required when NODE_ENV=production`. It is not a new mechanism.

### Parsing

Trim each entry, drop empty entries (so a trailing separator is harmless), preserve order.
A quoted value is rejected at validation, not silently accepted — the hosting dashboard does
not strip quotes, and a quoted string is not a valid origin.

### Test expectations

| Case | Expectation |
|---|---|
| Request from a listed origin | Access granted |
| Request from an unlisted origin | Access **not** granted |
| Deployed environment, value absent | Startup fails naming `CORS_ORIGINS` |
| Deployed environment, value empty | Startup fails — present-but-empty is not valid |
| Value with spaces after separators | Parsed into clean origins |
| Value wrapped in quotes | Startup fails |
| Local environment, value absent | Starts normally |

---

## 2. Protective response headers (FR-014)

**Entry state**: no protective headers are set on any response.

**Target**: `helmet()` registered as middleware in the shared transport setup, so every
response from every route carries the headers enumerated below.

`helmet@8.3.0` is already a dependency (added by feature 001, never wired). No new
dependency is needed. `INestApplication.use()` is available, so it registers from
`configureApp` without changing that function's signature.

### The headers, enumerated

Captured from the installed `helmet@8.3.0` rather than quoted from documentation, so this
list is what the middleware actually sets:

| Header | Default value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self'; frame-ancestors 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' https: 'unsafe-inline'; upgrade-insecure-requests` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `no-referrer` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Origin-Agent-Cluster` | `?1` |
| `X-DNS-Prefetch-Control` | `off` |
| `X-Download-Options` | `noopen` |
| `X-Permitted-Cross-Domain-Policies` | `none` |
| `X-XSS-Protection` | `0` |
| `X-Powered-By` | **removed** |

⚠️ **The `script-src 'self'` directive breaks the local documentation page.** See §4 — this
is a real interaction between two tasks in this feature, not a hypothetical.

### Test expectations

Assert a **named subset plus the removal**, not all thirteen. Asserting the full set makes
the suite fail on any helmet upgrade that adds or renames a header, which is churn rather
than protection.

| Case | Expectation |
|---|---|
| Any successful response | Carries `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy` |
| Any successful response | Does **not** carry `X-Powered-By` — the framework's server banner is gone |
| Any error response | Carries them too — headers must not depend on the happy path |
| Health route | Carries them, confirming shared application rather than per-route wiring |

---

## 3. Authentication rate limiting (FR-015)

**Entry state**: sign-in accepts attempts as fast as a caller can produce them.

**Target**: the throttler guard applied to the authentication controller with the limits
below, refusing further attempts from one source until the window resets.

### The limits

| Scope | Limit | Window |
|---|---|---|
| Sign-in (`POST /api/login`) | **5 attempts** | **60 seconds** per source |
| Every other route (module default) | 20 requests | 60 seconds per source |

Stated numerically because a test cannot assert "a tight limit". Five attempts per minute
allows a person who has mistyped a password to retry immediately while making sequential
password guessing useless.

### Wiring

Shapes verified against the installed `@nestjs/throttler@6.5.0` type definitions:

```ts
// src/app.module.ts
import { ThrottlerModule, seconds } from '@nestjs/throttler';
ThrottlerModule.forRoot([{ name: 'default', ttl: seconds(60), limit: 20 }]),

// src/auth/controllers/auth.controller.ts
@Public()
@UseGuards(ThrottlerGuard, AuthGuard('local'))
@Throttle({ default: { limit: 5, ttl: seconds(60) } })
@Post()
login(@Req() req: Request) { … }
```

Two details are load-bearing:

1. **`ThrottlerGuard` must be listed before `AuthGuard('local')`.** Guards run in
   declaration order. If the auth guard runs first, a wrong password throws 401 before the
   throttler increments its counter — so failed sign-in attempts would never be counted,
   defeating the entire control. This is the single easiest way to implement this
   requirement and still have it do nothing.
2. **Do not set `blockDuration`.** The option exists and is tempting, but SC-010 states the
   refusal "lifts automatically once the window resets". A block duration outlasts the
   window and would contradict that criterion.

`@nestjs/throttler@6.5.0` is already a dependency (added by feature 001, never wired). It
exports `ThrottlerModule`, `ThrottlerGuard`, `Throttle`, `SkipThrottle`, and `seconds` /
`minutes` duration helpers; from v5 onward `ttl` is expressed in **milliseconds**, which the
helpers make explicit.

Scoped to the authentication controller rather than registered globally. FR-015 asks for
authentication attempts specifically, and a third global guard would alter the ordering the
security feature deliberately arranged (authenticate, then authorize).

### Known limitation — read before relying on this

Counters live in **process memory**. On a serverless platform each instance has its own
memory and instances scale out, so a counter in one instance does not constrain requests
routed to another. This control blunts naive repeated attempts against a warm instance; it
does **not** impose a deployment-wide limit, and concurrent requests can dilute it.

FR-015 must not be read as a stronger guarantee than this. Closing it properly needs shared
state (a Redis-backed store) or platform edge rate limiting — new infrastructure, outside
this feature. Recorded in [plan.md](../plan.md) Complexity Tracking.

### Test expectations

| Case | Expectation |
|---|---|
| 5 sign-in attempts within 60s | All processed normally |
| The 6th attempt within the same window | Refused |
| Attempts with a **wrong password** | Counted — this is the case the guard ordering above protects |
| After the window resets | Accepted again, with no residual block |
| A non-auth route | Unaffected, confirming the guard is scoped rather than global |

---

## 4. Documentation page withdrawal (FR-002a)

**Entry state**: the browsable documentation page is served in every environment, including
deployed ones, publishing a complete map of every endpoint and request shape to anyone with
the URL.

**Target**: registered only when not running in a deployed environment, keyed off the
validated environment value.

| Environment | `/docs` |
|---|---|
| Local | Served, unchanged |
| Deployed | Not served — answers not found |

The document is still generated and every endpoint keeps its metadata, so Constitution IV
is unaffected. That principle governs whether the contract is accurate, not whether a
browsable page is published to the internet.

### Interaction with §2 — the CSP blocks the page

Helmet's default `script-src 'self'` (plus `script-src-attr 'none'`) forbids inline script,
and `swagger-ui-express` serves its initializer as an inline `<script>` block. Both facts
were confirmed against the installed packages. So applying helmet globally **breaks the
documentation page** — and because the page is only ever served outside deployed
environments, it breaks it in the one place it exists.

The fix relaxes the CSP for that single path, registered *after* the global helmet so it
wins:

```ts
app.use(helmet());                       // strict headers on every response

if (!isDeployed) {
  // Registered after the global helmet so it overrides that strict CSP for this path only.
  // Swagger UI ships an inline initializer script, which script-src 'self' blocks. The
  // relaxation is unreachable in a deployed environment because the page is not registered
  // there at all.
  app.use('/docs', (_req, res, next) => {
    res.removeHeader('Content-Security-Policy');
    next();
  });
  SwaggerModule.setup('docs', app, document);
}
```

**`helmet({ contentSecurityPolicy: false })` scoped to the path does not work.** It simply
does not set the header, leaving the strict value the global call already set. The header
has to be removed explicitly.

Deployed responses are unaffected: the override is inside the same condition that decides
whether the page is registered, so a deployed environment never installs it.

### Test expectations

| Case | Expectation |
|---|---|
| Local environment | Documentation page returns 200 **and** carries no `Content-Security-Policy`, so its inline script can execute |
| Deployed environment | Not served |
| Deployed environment, any other route | Still carries the strict `Content-Security-Policy` from §2 |
| Either environment | Endpoint metadata still present on every route |

Asserting the absent CSP header matters: a test that checks only for 200 would pass against
a silently blank Swagger page whose script was blocked.

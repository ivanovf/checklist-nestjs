# Phase 0 Research: Vercel Deployment Configuration

**Feature**: `specs/002-fix-vercel-deploy` | **Date**: 2026-09-17

All open technical questions from the plan's Technical Context are resolved below. Each
decision was checked against the installed dependency set rather than assumed; the
verification column records how.

---

## R1 — Satisfying the platform's output-directory requirement

**Decision**: Publish a dedicated `public/` directory containing exactly one intentional
file (`robots.txt`), and point `vercel.json#outputDirectory` at it.

**Rationale**: The build fails because the platform, given an explicit `buildCommand` and
no framework preset, expects the build to yield a directory of static files to serve. An
API-only project produces no such directory. Declaring a directory that contains only
content we chose satisfies the check while keeping the published static surface to a single
known file.

`robots.txt` rather than `index.html` is deliberate. The platform resolves static files
**before** applying rewrites, so any file placed here shadows the corresponding path. An
`index.html` would therefore capture `/` and prevent it reaching the application; a
`robots.txt` shadows only `/robots.txt`, which the application does not define. It also
pairs with withdrawing the documentation page (R7): a service that no longer publishes its
endpoint map should not invite crawling either.

**Alternatives considered**:

| Alternative | Rejected because |
|---|---|
| `outputDirectory: "."` (serve repo root) | Publishes the entire repository as downloadable static content — source, `package.json`, `vercel.json`, `specs/`. Because filesystem resolution precedes rewrites, the catch-all rewrite would not protect them. Directly violates FR-003. |
| Empty `public/` with only `.gitkeep` | Works, but `.gitkeep` would itself be the one publicly served file, which is meaningless. `robots.txt` costs the same and does something useful. |
| `public/index.html` landing page | Shadows `/`, so the root path stops reaching the application. Permitted by the spec but a behaviour change nobody asked for. |
| Drop `buildCommand`, rely on auto-detection | The platform still runs the `build` script and still expects static output, so the same check fails. Also loses the explicit install command that guards devDependencies. |

**Verification**: The failing check is quoted verbatim in the spec's `**Input**`. Static
files resolving before rewrites is the platform's documented routing order and is why the
`outputDirectory: "."` option is unsafe rather than merely untidy.

---

## R2 — Node.js runtime version

**Decision**: Declare `24.x` in `package.json#engines`, and use `24` in CI.

**Rationale**: The deploy log shows the hosting project is already configured for `24.x`
and that our `22.x` declaration overrode it, which discarded the build cache and emitted a
warning on every build. Aligning upward removes both, matches the platform's own setting,
and the user explicitly approved upgrading.

**Verification**: Every direct dependency's `engines.node` constraint was evaluated against
`24.0.0`; none excludes it. Node 24 additionally satisfies `eslint-visitor-keys`
(`^20.19.0 || ^22.13.0 || >=24`), which currently warns on the local Node 22.12.0 install,
so this also clears an existing local install warning.

**Consequence for the developer machine**: the local runtime is 22.12.0, below the declared
`24.x`. `npm install` will report an engine mismatch until the local Node is upgraded
(`nvm install 24`). This is expected and is the point of declaring the version once.

**Alternatives considered**: holding at `22.x` and changing the hosting project to match
was rejected — it keeps the repository behind the platform default for no benefit, and the
user approved the upgrade.

---

## R3 — Cross-origin allowlist

**Decision**: Read a comma-separated `CORS_ORIGINS` value from configuration and pass the
parsed list to the framework's CORS options. Required when deployed, optional locally.

**Rationale**: This mechanism is **already specified** by feature 001's configuration
contract, which defines `CORS_ORIGINS` as "comma-separated list of absolute origins, at
least one", optional in local and **required** in production, with the startup failure
message `CORS_ORIGINS is required when NODE_ENV=production`. Inventing a second mechanism
would contradict an existing accepted contract. This feature implements what 001 designed
and left unbuilt.

The current call is `app.enableCors()` with no arguments, which grants every origin —
prohibited by Constitution III outside local development.

**Verification**: `INestApplication.enableCors(options?: CorsOptions)` accepts an options
object, confirmed against the installed `@nestjs/common` type definitions.

**Alternatives considered**: a hardcoded origin list was rejected — it cannot differ per
environment (FR-013) and would put a deployment detail in source.

---

## R4 — Security response headers

**Decision**: Apply `helmet()` as middleware inside the shared `configureApp` function.

**Rationale**: `configureApp` in `src/bootstrap.ts` is the single place both entry points
(the port listener and the serverless handler) already share, so applying it there means
the deployed path cannot diverge from the local one. Placing it in only one entry point is
exactly the drift `bootstrap.ts` was created to prevent.

**Verification**: `helmet@8.3.0` is installed and `require('helmet')` returns a function.
Note that `require('helmet/package.json')` fails — v8 restricts deep imports via its
`exports` field — so version probes must not rely on that path. `INestApplication.use()` is
declared in the installed type definitions, so middleware can be registered from
`configureApp` without widening its parameter type.

**Alternatives considered**: no new dependency was needed; helmet was already added to
`package.json` by feature 001 and left unwired.

---

## R5 — Authentication rate limiting (with a documented limitation)

**Decision**: Use the already-installed `@nestjs/throttler`, applying its guard to the
authentication controller with a tight limit rather than registering it globally.

**Rationale**: FR-015 asks specifically for authentication attempts to be limited. Scoping
the guard to that controller delivers it without changing request handling for every other
route, and avoids inserting a third global guard into an ordering that the security feature
deliberately arranged (authentication then authorization).

**Verification**: `@nestjs/throttler@6.5.0` is installed and exports `ThrottlerModule`,
`ThrottlerGuard`, `Throttle`, `SkipThrottle`, and the `seconds`/`minutes` duration helpers
(v5+ expresses `ttl` in milliseconds, which those helpers make explicit).

**Known limitation — this only partially achieves the intent.** The default storage is
in-process memory. On a serverless platform each instance has its own memory and instances
scale out horizontally, so a counter held in one instance does not constrain requests
routed to another. The control therefore blunts naive repeated attempts against a warm
instance but does **not** provide a deployment-wide limit, and a determined attacker can
dilute it by simply making concurrent requests. Closing that properly needs shared state
(a Redis-backed store or the platform's own edge rate limiting), which is new
infrastructure and outside this feature.

This limitation must be recorded in the feature's deviations rather than left implied, so
that FR-015 is not later read as a stronger guarantee than what ships.

**Alternatives considered**:

| Alternative | Rejected because |
|---|---|
| Register the guard globally | Throttles every route, changes global guard ordering, and risks refusing legitimate traffic — beyond what FR-015 asks. |
| Add a Redis-backed shared store now | Correct eventual answer, but introduces external infrastructure this feature has no mandate to provision. |
| Platform edge rate limiting | Deployment-wide and effective, but configured outside the repository, so it cannot be tested by the project's own suite. Worth revisiting. |

---

## R6 — Health endpoint reporting data-store reachability

**Decision**: Hand-roll a small health module that injects the Mongoose connection and
reports its state. Do not add a new dependency.

**Rationale**: Constitution "Development Workflow" requires that a change adding a
dependency justify it and "prefer the framework's built-in capability over a new package".
The reachability check needed here is a single connection-state read, so the packaged
health-check library (`@nestjs/terminus`, not currently installed) would be a new
dependency earning very little.

**Verification**: `@nestjs/mongoose@10.0.6` exports `InjectConnection` and
`getConnectionToken` (both confirmed present), so the live connection can be injected
directly. `mongoose@8.4.0` exposes `STATES` as
`{disconnected: 0, connected: 1, connecting: 2, disconnecting: 3, uninitialized: 99}`, so
"reachable" maps to `readyState === 1` and every other value is reported as unavailable.
`@nestjs/terminus` is confirmed **not** installed.

**Design points**:

- The route must carry the explicit public marker, since authorization is default-deny and
  deploy verification runs with no credential.
- It must report unavailability rather than success when the connection is not ready
  (FR-016), which means a non-success status, not a success body containing a sad field.
- It must not echo connection strings, credentials, or driver error text (FR-017). A state
  label is sufficient; the underlying error belongs in logs.
- Reading connection state is a local property read, not a network round trip, so it adds
  no latency and cannot itself hang. A true round-trip ping was considered and rejected as
  unnecessary for the requirement and capable of making the health route the slowest route.

---

## R7 — Withdrawing the documentation page from deployed environments

**Decision**: Register the documentation page only when the service is not running in a
deployed environment, keyed off the validated environment configuration value.

**Rationale**: Resolves the clarification recorded in the spec. The document itself is
still generated and every endpoint keeps its metadata, so Constitution IV is unaffected —
that principle governs the accuracy of the contract, not whether a browsable page is served
to the public internet.

**Verification**: the existing startup schema already validates the environment value as
one of a closed set, so the condition rests on a value that cannot be absent or malformed
at the point it is read.

**Alternatives considered**: putting the page behind a credential was rejected as more
moving parts than not serving it, for a developer convenience that local runs already
provide.

---

## R8 — Static-versus-dynamic routing order

**Finding, not a decision**: The platform resolves published static files before applying
rewrites. Two consequences follow and both are already reflected above:

1. Anything placed in the published directory shadows its path and becomes unreachable by
   the application (R1's reason for avoiding `index.html`).
2. Publishing the repository root would expose every file in it regardless of the catch-all
   rewrite, which is what makes `outputDirectory: "."` unsafe rather than merely untidy.

This is the mechanism behind User Story 4, and the acceptance scenarios there are the test
of it.

---

## Summary of decisions

| ID | Decision | Requirements served |
|---|---|---|
| R1 | Publish `public/` containing only `robots.txt`; set `outputDirectory` | FR-001, FR-003 |
| R2 | Declare Node `24.x` once; CI matches | FR-005, FR-006, FR-007 |
| R3 | `CORS_ORIGINS` allowlist per environment, reusing 001's contract | FR-012, FR-013 |
| R4 | `helmet()` in shared `configureApp` | FR-014 |
| R5 | Throttler guard on the auth controller (limited by in-memory storage) | FR-015 (partially) |
| R6 | Hand-rolled health module using the injected Mongoose connection | FR-016, FR-017 |
| R7 | Documentation page not served when deployed | FR-002a |
| R8 | Routing-order finding governing what may be published | FR-003 |

**No unresolved NEEDS CLARIFICATION items remain.**

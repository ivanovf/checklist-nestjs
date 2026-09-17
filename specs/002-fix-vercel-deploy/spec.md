# Feature Specification: Vercel Deployment Configuration

**Feature Branch**: `feat/security-hardening-vercel-deploy`

**Created**: 2026-09-17

**Status**: Draft

**Input**: User description: "Help me to resolve this issue: [Vercel build log for commit 8c5865b] `Skipping build cache since Node.js version changed from "24.x" to "22.x"` / `Warning: Due to "engines": { "node": "22.x" } in your package.json file, the Node.js Version defined in your Project Settings ("24.x") will not apply` / `Error: No Output Directory named "public" found after the Build completed. Update vercel.json#outputDirectory to ensure the correct output directory is generated.` Prepare the API to be deployed in vercel, if it is necessary to upgrade node version it is ok."

## Clarifications

### Session 2026-09-17

- Q: Should this feature also enable the deployed-environment security controls the constitution requires (explicit CORS allowlist, security headers, authentication rate limiting), or stay a narrow deploy fix? → A: Include all three in this feature, because it is what first exposes the service publicly and Constitution III requires them in every deployed environment.
- Q: How should the deploy-verification step confirm the service is genuinely healthy, given that the root route returns a static banner and never contacts the data store? → A: Add a dedicated health endpoint that reports data store reachability, and point the deploy verification at it; the root route stays a cheap static banner.
- Q: Should the interactive API documentation page stay publicly reachable on the deployed service? → A: No — serve it outside deployed environments only, so developers keep it locally while the deployed service stops publishing its own endpoint map.
- Q: Should this feature also turn on strict request-body validation so unknown fields are rejected, as Constitution IV requires? → A: No — defer it to a follow-up and record it here as a known deviation, because tightening every endpoint's contract carries regression risk that does not belong in the change that unblocks the deploy.

### Session 2026-09-17 (post-plan)

- Q: Should a preview deployment behave exactly like production, or as its own third environment? → A: Identical to production. "Deployed" is a single behaviour covering both, so what is verified on a preview URL is exactly what production does; no third environment value is introduced.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A deploy of the current commit succeeds and the API answers (Priority: P1)

The maintainer pushes the branch and the hosting platform builds and publishes the service
without manual intervention. When the deploy reports success, the service is genuinely
reachable: a caller can reach a health route that reports whether the data store is
actually reachable, and protected routes refuse callers who present no credential.

Today the build stops before publishing anything. Dependency installation and compilation
both succeed, and then the platform rejects the result because it cannot find a directory
of static web files to serve. This service has no static web files — it is an API whose
build output feeds a request handler — so the check can never pass as configured, and no
amount of retrying will publish it.

**Why this priority**: Nothing else in this feature matters if the service cannot be
deployed at all. Every other requirement here describes a property of a running
deployment, and there is currently no running deployment to have properties.

**Independent Test**: Trigger a deploy of the branch head and confirm it completes; then
call the health route on the resulting URL and confirm it reports the service and its data
store as available. Delivers value on its own — the service becomes reachable — even if
nothing else ships.

**Acceptance Scenarios**:

1. **Given** a commit that passes all local quality gates, **When** the platform builds it,
   **Then** the build completes and the deployment is published.
2. **Given** a published deployment whose data store is reachable, **When** a caller
   requests the health route, **Then** it reports the service as healthy and the data store
   as available.
3. **Given** a published deployment whose data store becomes unreachable after startup,
   **When** a caller requests the health route, **Then** it reports the data store as
   unavailable rather than reporting success. (A cold start against an already-unreachable
   store fails to start at all — see Known Deviations.)
4. **Given** a published deployment, **When** a caller requests a protected route with no
   credential, **Then** the request is refused rather than served.
5. **Given** a published deployment, **When** a caller requests a route that does not
   exist, **Then** the service answers "not found" rather than failing or hanging.

---

### User Story 2 - The public deployment carries its required protections (Priority: P1)

Publishing this service puts it on the open internet for the first time. From that moment
the protections the project requires of any deployed environment have to be in force: the
service declares which origins may call it from a browser rather than accepting all of
them, its responses carry the standard protective headers, and repeated failed sign-in
attempts from one source are slowed down instead of being answered indefinitely.

None of these are in force today. Cross-origin access is granted to every origin with no
allowlist, no protective response headers are set, and sign-in accepts attempts at
whatever rate a caller can produce them.

**Why this priority**: This is a co-requisite of User Story 1 rather than a follow-up. The
project's own rules tie these three controls to *every* deployed environment, so a
deployment that succeeds without them is a deployment that is knowingly out of compliance
on its first public URL. Sequencing them after the deploy would mean deliberately
publishing the gap and then closing it.

**Independent Test**: Against a published deployment, make a cross-origin request from an
origin that is not approved and confirm access is not granted; inspect any response and
confirm the protective headers are present; exceed the permitted sign-in attempt rate from
one source and confirm further attempts are refused. Each is observable from outside the
service with no access to its internals.

**Acceptance Scenarios**:

1. **Given** a published deployment, **When** a browser on an origin that is not approved
   makes a cross-origin request, **Then** the response does not grant that origin access.
2. **Given** a published deployment, **When** a browser on an approved origin makes a
   cross-origin request, **Then** the request succeeds.
3. **Given** a published deployment, **When** any response is returned, **Then** it carries
   the standard protective headers.
4. **Given** a published deployment, **When** one source exceeds the permitted rate of
   failed sign-in attempts, **Then** further attempts are refused until the window resets.
5. **Given** the service running locally for development, **When** a developer origin calls
   it, **Then** the call succeeds, confirming the approved-origin list is per-environment
   rather than a single global list that blocks local work.

---

### User Story 3 - One runtime version across local, CI, and production (Priority: P2)

The maintainer declares the platform runtime version once, and local development,
continuous integration, and the deployed environment all agree on it. A change to that
version is a single deliberate edit, not three edits in three places that drift apart.

The current deploy log shows the disagreement plainly: the hosting project is configured
for one major version, the repository declares a different one, the repository wins, and
the platform reports both the override and a discarded build cache as a consequence.

**Why this priority**: The service still deploys under a version disagreement, so this is
not blocking. It is ranked immediately after P1 because a runtime mismatch is exactly the
class of problem that passes every test locally and fails only in production, and because
discarding the build cache on every deploy makes each deploy slower than it needs to be.

**Independent Test**: Deploy twice in a row without changing dependencies, and confirm the
log reports no runtime-version override, no version-change cache invalidation, and reuses
the cache on the second deploy.

**Acceptance Scenarios**:

1. **Given** the declared runtime version, **When** the platform builds the project,
   **Then** the log contains no warning that a configured version is being overridden.
2. **Given** two consecutive deploys with unchanged dependencies, **When** the second one
   builds, **Then** it reuses the build cache rather than discarding it for a version
   change.
3. **Given** the declared runtime version, **When** the quality gates run in continuous
   integration, **Then** they run on that same version.
4. **Given** the declared runtime version, **When** dependencies are installed, **Then**
   no dependency reports the runtime as unsupported.

---

### User Story 4 - The deployment exposes the API and nothing else (Priority: P3)

A caller on the public internet can reach the service's functional routes and nothing else
the repository contains. Source files, compiled output, dependency manifests, deployment
configuration, specification documents, and the interactive API documentation page are not
retrievable from the deployed URL.

**Why this priority**: This is a guard rather than a new capability. The most direct way to
satisfy User Story 1 — telling the platform that the project root is the directory of files
to serve — would publish the entire repository as downloadable static content. That would
resolve the build error and silently create an information-disclosure problem, so the
boundary is written down as a requirement rather than left to judgement.

**Independent Test**: Against a published deployment, request a set of known repository
paths (a source file, the dependency manifest, the deployment configuration, a spec
document) plus the API documentation page, and confirm each is refused or reported as not
found.

**Acceptance Scenarios**:

1. **Given** a published deployment, **When** a caller requests the path of a known source
   file, **Then** the file's contents are not returned.
2. **Given** a published deployment, **When** a caller requests the dependency manifest or
   the deployment configuration by path, **Then** the contents are not returned.
3. **Given** a published deployment, **When** a caller requests a compiled build artifact
   by path, **Then** the contents are not returned.
4. **Given** a published deployment, **When** a caller requests the interactive API
   documentation page, **Then** it is not served.

---

### Edge Cases

- **A build that produces no web-servable files at all.** This is the current failure. The
  platform's default expectation is a static site; an API-only project satisfies no such
  expectation and the configuration must say so explicitly rather than gesture at a
  directory that will never exist.
- **A request for a path that is neither an API route nor a published file.** It must reach
  the application and receive a normal "not found" answer, rather than being absorbed by
  the platform's file lookup and answered inconsistently.
- **The platform changes its default runtime version.** Because the version is declared in
  the repository, a platform-side default change must not silently move the runtime under a
  deployment that was not rebuilt.
- **A declared runtime version the platform no longer offers.** A version that has reached
  end of life must fail the deploy with a clear message rather than being silently
  substituted.
- **The first request after a period of inactivity.** A cold start must establish the data
  store connection once and reuse it for subsequent requests on the same instance, rather
  than opening a new connection per request and exhausting the connection limit.
- **A browser client calling a preview deployment.** Preview URLs change per branch and per
  deploy, so an origin that was approved for production is not automatically approved for a
  preview. Because preview and production behave identically, a browser-based check against
  a preview needs that preview's origin on the approved list; command-line verification
  needs nothing, since the allowlist governs browsers only. The hosting platform scopes
  configuration values per environment, so this is a configuration step rather than a code
  path.
- **A required configuration value missing from the deployed environment.** Startup must
  fail immediately and name the offending value, rather than publishing a deployment that
  fails opaquely on its first real request.
- **A configuration value entered with surrounding quotation marks.** Values supplied
  through the platform are taken literally; a quoted value must not be accepted as if the
  quotes had been stripped, because the resulting connection string is malformed in a way
  that is hard to read from the error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The deployment MUST complete successfully for a project that produces no
  directory of static web files.
- **FR-002**: Every functional route the application defines MUST be reachable through the
  published deployment URL.
- **FR-002a**: The interactive API documentation page MUST NOT be served from a deployed
  environment, and MUST remain available when the service runs outside one.
- **FR-002b**: "Deployed environment" MUST cover every published deployment, preview and
  production alike. No *behavioural* requirement in this specification may distinguish
  between them, so that what is verified on a preview deployment is exactly what production
  does. Configuration *values* may still differ per environment where FR-013 allows it — a
  different approved-origin list is a configuration difference, not a behavioural one.
- **FR-003**: The published deployment MUST NOT serve repository source files, compiled
  build output, dependency manifests, deployment configuration, or specification documents
  to any caller.
- **FR-004**: A request for an unknown path MUST be answered by the application as "not
  found", consistently with a request for an unknown path on a local run.
- **FR-005**: The platform runtime version MUST be declared in exactly one place in the
  repository, and that declaration MUST govern local development, continuous integration,
  and the deployed environment.
- **FR-006**: The declared runtime version MUST satisfy the minimum supported version of
  every production and build-time dependency, and dependency installation MUST report no
  unsupported-runtime warnings.
- **FR-007**: A deploy MUST NOT discard the build cache because of a runtime-version
  disagreement between the repository and the hosting project.
- **FR-008**: Deployment configuration committed to the repository MUST NOT contain
  secrets, credentials, or connection strings; all such values MUST be injected at runtime
  by the hosting environment.
- **FR-009**: The application MUST establish its data store connection once per instance
  and reuse it across requests handled by that instance.
- **FR-010**: Startup MUST fail immediately, naming every offending value, when a required
  configuration value is absent or malformed in the deployed environment.
- **FR-011**: Only a commit that passes every quality gate MUST be eligible for promotion
  to production.
- **FR-012**: The deployed service MUST grant cross-origin browser access only to an
  explicitly approved list of origins, and MUST NOT grant it to all origins.
- **FR-013**: The approved-origin list MUST be configurable per environment, so that local
  development origins do not have to be approved in production and vice versa.
- **FR-014**: Every response from the deployed service MUST carry the standard protective
  response headers.
- **FR-015**: The deployed service MUST limit the rate of authentication attempts accepted
  from a single source, and MUST refuse attempts beyond that rate until the window resets.
- **FR-016**: The service MUST expose a health route that reports whether its data store is
  reachable, and MUST report unavailability rather than success when it is not. This applies
  to a connection that fails after startup; a cold start against an unreachable store does
  not complete startup at all, as recorded in Known Deviations.
- **FR-017**: The health route MUST NOT disclose connection strings, credentials, or
  internal error detail in its response.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A deploy of the target branch completes and publishes on the first attempt,
  with no manual step between pushing the commit and the service being reachable.
- **SC-002**: The health route reports the service and its data store as available within
  30 seconds of the deploy reporting completion.
- **SC-003**: 100% of protected routes refuse a caller presenting no credential.
- **SC-004**: 100% of attempts to retrieve a repository source, configuration, or build
  artifact path, or the interactive API documentation page, from the deployed URL fail to
  return its contents.
- **SC-005**: The deploy log contains zero runtime-version override warnings and zero
  version-change cache invalidations.
- **SC-006**: Two consecutive deploys with unchanged dependencies complete without either
  one reinstalling dependencies from scratch.
- **SC-007**: A deploy attempted with a required configuration value missing fails with a
  message naming that value, rather than publishing a deployment that errors on first use.
- **SC-008**: 0% of cross-origin requests from origins outside the approved list are
  granted access, while 100% from approved origins succeed.
- **SC-009**: 100% of responses from the deployed service carry the standard protective
  headers.
- **SC-010**: Authentication attempts from a single source beyond the permitted rate are
  refused 100% of the time, and the refusal lifts automatically once the window resets.

## Assumptions

- The hosting platform is Vercel, and the repository is already linked to an existing
  project, so no new project provisioning is in scope.
- The platform reports the same environment value for preview and production deployments,
  which is consistent with treating them identically (FR-002b) and means no additional
  environment value has to be introduced or validated. Distinguishing them would require
  reading a platform-specific variable, which this feature deliberately does not do.
- Upgrading the runtime is acceptable. The user stated this explicitly, and the hosting
  project is already configured for the newer major version, so aligning the repository
  upward is less disruptive than holding the platform back.
- The interactive API documentation page is for developers, not for consumers of the
  deployed service, so withdrawing it from deployed environments is not treated as a loss
  of capability. The endpoint metadata the project requires on every route is unaffected —
  that requirement is about the document being accurate, not about serving it publicly.
- Configuration values are supplied through the hosting platform's environment settings and
  remain untracked in the repository, consistent with the existing constitution rule that
  `.env*` files stay untracked.
- The data store permits connections from the hosting platform's dynamic egress addresses.
  This is an environment prerequisite outside the repository and cannot be satisfied by a
  code change.
- The root path of the deployment is not required to serve a human-facing landing page. It
  may answer "not found", since the application defines no route there.
- Existing quality gates (lint, unit tests with coverage thresholds, end-to-end tests,
  build) and the already-implemented request handler, connection reuse, and startup
  configuration validation are treated as given. Beyond publishing the service, the only
  behaviour this feature changes is the addition of the three deployed-environment
  protections in User Story 2.
- Resolving the outstanding dependency advisories reported during installation is out of
  scope for this feature; the constitution's audit gate tracks them separately.

### Known Deviations

These are recorded rather than resolved, so they are visible to a reviewer instead of
being silently absent:

- **Strict request-body validation (Constitution IV).** The global validation does not
  reject unknown fields, so extra properties in a request body are accepted rather than
  refused. Deferred deliberately: tightening this changes the contract of every endpoint
  and needs a field-by-field sweep of each request shape, which is a different class of
  risk from a deployment change and would make this feature unshippable in one pass. It
  should be its own feature.
- **Dependency advisories.** Installation reports unresolved advisories, including critical
  ones. The constitution's audit gate covers these; they are not addressed here.
- **Authentication rate limiting is per-instance, not deployment-wide.** The counters live
  in process memory, so on a platform that scales instances out horizontally a counter held
  by one instance does not constrain requests routed to another. The control blunts repeated
  attempts against a warm instance; it does not bound attempts across the deployment, and
  concurrent requests dilute it. FR-015 must not be read as a stronger guarantee than this.
  Closing it properly requires shared state or platform edge rate limiting, which is new
  infrastructure outside this feature.
- **The health route cannot report an unreachable data store at cold start.** Found during
  implementation, not planning. When the connection cannot be established, the framework's
  database module retries and application startup never completes, so no route — including
  the health route — is ever registered; the platform reports an invocation failure instead
  of a clean unavailable response. The health route therefore covers the case that matters
  operationally, an instance whose connection drops or degrades *after* startup, and does
  not cover a cold start against a dead store. Making startup succeed without a live
  connection would mean changing how the whole application connects, in every environment,
  which is a larger change than this feature should carry.

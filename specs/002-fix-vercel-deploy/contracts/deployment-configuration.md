# Contract: Deployment Configuration

**Feature**: `specs/002-fix-vercel-deploy` | Serves FR-001, FR-003, FR-005, FR-006, FR-007

## Platform build contract

| Setting | Value | Why |
|---|---|---|
| `installCommand` | `npm install --include=dev` | The build needs `typescript` and `@nestjs/schematics`, both devDependencies. With `NODE_ENV=production` set in the hosting project, a plain `npm install` skips them and the build fails. |
| `buildCommand` | `nest build` | Compiles with the real TypeScript compiler, emitting decorator metadata. The platform's own transpiler does not, and the framework's dependency injection cannot resolve constructors without it. |
| `outputDirectory` | `public` | **The fix for the current failure.** The platform requires a directory of static files to serve; an API-only project produces none. This publishes exactly one deliberate file. |
| `framework` | `null` | Prevents a framework preset from imposing its own build and output expectations. |
| `functions["api/index.js"].includeFiles` | `dist/**` | The compiled application is loaded by the function shim at runtime and must be bundled with it. |
| `rewrites` | `/(.*)` → `/api` | Routes all non-static paths to the single function. |

Settings declared here take precedence over the hosting project's dashboard settings.

## Published static surface

```text
public/
└── robots.txt
```

Exactly one file. `robots.txt` disallows crawling, which pairs with withdrawing the
documentation page from deployed environments.

**No `index.html`.** Static files resolve *before* rewrites, so any file here shadows its
path and becomes unreachable by the application. An `index.html` would capture `/`; a
`robots.txt` shadows only `/robots.txt`, which the application does not define.

### What must never be published

`outputDirectory` must **not** be set to `.` or any directory containing source. Because
resolution precedes rewrites, the catch-all rewrite does not protect files that exist on
disk — publishing the root would serve source, `package.json`, `vercel.json`, and `specs/`
as downloadable content. This is the failure mode User Story 4 exists to prevent.

| Path class | Published | Verified by |
|---|---|---|
| `public/robots.txt` | yes | US4 scenario set |
| `src/**`, `dist/**` | no | US4 scenarios 1, 3 |
| `package.json`, `vercel.json` | no | US4 scenario 2 |
| `specs/**` | no | US4 independent test |
| `/docs` documentation page | no | US4 scenario 4 |

## Runtime version contract

| Location | Value |
|---|---|
| `package.json#engines.node` | `24.x` |
| `.github/workflows/ci.yml` → `node-version` | `24` |
| Hosting project setting | `24.x` (already configured) |

One declaration in the repository, and the hosting project already agrees with it. This
removes both the version-override warning and the cache invalidation that the failing build
log reported.

**Verified**: no direct dependency's `engines.node` excludes Node 24. It additionally
satisfies `eslint-visitor-keys` (`^20.19.0 || ^22.13.0 || >=24`), which warns on Node
22.12.0 today.

**Developer action required**: the local machine runs 22.12.0 and will report an engine
mismatch on install until upgraded (`nvm install 24`).

## Required environment values

Supplied by the hosting environment, never committed.

| Key | Required when deployed | Notes |
|---|---|---|
| `DB_DRIVE`, `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` | yes | validated at startup |
| `DB_ARGS` | yes in practice | connection arguments |
| `DB_PORT` | **must be unset** | the `mongodb+srv` scheme rejects a port |
| `SECRET` | yes | signing secret; not yet in the startup schema |
| `TANK_API_KEY` | yes | not yet in the startup schema |
| `CORS_ORIGINS` | **yes — new** | see [transport-security.md](./transport-security.md) |
| `NODE_ENV` | set by the platform | `production`, satisfying the existing schema |
| `PORT` | not needed | nothing calls `listen` on the serverless path |

### Two failure modes to guard

1. **Quoted values.** The hosting dashboard takes values literally; it does not strip
   quotes the way a local env file does. `'mongodb+srv'` yields a malformed connection
   string whose error is hard to trace back to the quotes.
2. **`SECRET` and `TANK_API_KEY` are not in the startup schema.** Unlike the `DB_*` values,
   their absence does not fail fast — it surfaces later as an opaque error on first use.
   Adding them to the schema is out of scope here but worth knowing when configuring the
   environment.

## Environment prerequisite outside the repository

The data store must accept connections from the platform's dynamic egress addresses (Atlas
Network Access `0.0.0.0/0`). No code change can satisfy this, and without it every request
fails at the connection stage while the deploy itself reports success.

## Test expectations

| Case | Expectation |
|---|---|
| Fresh checkout, install, build | Succeeds with no file from `.gitignore` required |
| Build output | `dist/src/serverless.js` exists where the function shim expects it |
| Handler boot with env vars only, no env file | Serves requests |
| `outputDirectory` contents | Exactly one file; contains no source |
| Required value missing | Startup fails naming it (FR-010, SC-007) |

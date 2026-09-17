# Contract: Environment Configuration

**Feature**: `001-api-security-hardening` | **Date**: 2026-09-07

Every value the service requires, its validity rule, and where it applies. Validated at startup by
a schema; the service **exits** rather than starting when any rule fails (FR-008, research R7).

---

## Required values

| Name | Rule | local | deployed | Purpose |
|---|---|---|---|---|
| `NODE_ENV` | one of `local`, `production` | required | required | Selects the environment profile |
| `PORT` | integer, 1–65535 | optional, default 3000 | optional | Listen port |
| `DB_DRIVE` | non-empty string | required | required | Connection scheme |
| `DB_HOST` | non-empty string | required | required | Database host |
| `DB_PORT` | integer, 1–65535 | optional | optional | Omitted for hosted clusters |
| `DB_NAME` | non-empty string | required | required | Database name |
| `DB_USER` | non-empty string | required | required | Database user |
| `DB_PASS` | non-empty string | required | required | Database password |
| `DB_ARGS` | string | optional | optional | Extra connection arguments |
| `SECRET` | string, **min 32 characters** | required | required | Token signing secret (FR-009) |
| `TANK_API_KEY` | string, **min 32 characters** | required | required | Device key for `PATCH /api/config/:id` (research R4) |
| `CORS_ORIGINS` | comma-separated list of absolute origins, at least one | optional | **required** | Browser origin allowlist (FR-017, FR-018) |
| `LOGIN_MAX_ATTEMPTS` | integer ≥ 1 | optional, default 5 | optional, default 5 | Failure threshold |
| `LOGIN_WINDOW_MINUTES` | integer ≥ 1 | optional, default 15 | optional, default 15 | Rolling failure window |
| `LOGIN_LOCKOUT_MINUTES` | integer ≥ 1 | optional, default 15 | optional, default 15 | Lockout duration |

`TANK_API_KEY` is present in the local environment today but has no minimum-strength rule and is
not consumed by any code. Both change here.

`CORS_ORIGINS` being required in a deployed environment is the mechanism behind FR-018: there is no
"allow everything" fallback, so an unconfigured deployment cannot start rather than starting open.

---

## Startup behaviour

**On any rule failing**, the service MUST:

1. Write a message naming **the offending value and what is wrong with it** — for example
   `SECRET must be at least 32 characters` or `CORS_ORIGINS is required when NODE_ENV=production`.
2. Exit with a non-zero status.
3. Not open a listening socket, not connect to the database, and not serve a single request.

Reporting all failing values in one pass is preferred over stopping at the first, so a
misconfigured deployment is fixed in one cycle rather than several.

**On every rule passing**, the service starts with behaviour identical to today.

### Empty is not valid

A value that is present but empty (`SECRET=`) MUST be treated as failing, not as a valid empty
string. This is the spec's edge case and the most likely real-world misconfiguration.

---

## Consumption rules

- Configuration MUST be read through the injected configuration service, never `process.env` at
  module-factory time. `DatabaseModule`, `JwtModule`, and `JwtStrategy` all do the latter today,
  and the module that loads the environment file is registered *after* the database module — so
  correctness currently rests on initialisation order. Research R7 removes that dependency.
- No value in this table may appear as a literal in the source tree (FR-010), enforced by the CI
  secret scan (FR-012).
- No value in this table may be baked into a build artifact — the Docker image, the Lambda bundle,
  or the Vercel build (constitution, Security Standards). All are injected at runtime.

## Verification

For each required value: remove it, start the service, assert it exits naming that value
(SC-004). Repeat with the value present but empty, and — for `SECRET` and `TANK_API_KEY` — with a
value below the length minimum.

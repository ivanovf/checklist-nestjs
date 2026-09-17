# Data Model: API Security Hardening

**Feature**: `001-api-security-hardening` | **Date**: 2026-09-07

This feature adds one collection and tightens one existing schema. No migration of existing
reservation, item, lock, activity, or config data is required.

---

## New entity — `LoginAttempt`

Tracks consecutive failed sign-in attempts per account so that throttling survives serverless
cold starts and is shared across concurrently running instances (FR-016, research R5).

**Collection**: `login_attempts`

| Field | Type | Required | Notes |
|---|---|---|---|
| `identifier` | string | yes | The normalised (lower-cased, trimmed) email the sign-in was attempted against. Stored even when no such account exists, so that enumeration is not possible via throttling behaviour. |
| `failureCount` | integer | yes | Consecutive failures. Reset to 0 on a successful sign-in. Default 0. |
| `firstFailureAt` | date | no | When the current failure streak began. Used to apply the rolling window. |
| `lastFailureAt` | date | yes | Timestamp of the most recent failure. |
| `lockedUntil` | date | no | When set and in the future, all attempts for this identifier are refused. Absent when not locked. |
| `expiresAt` | date | yes | TTL anchor. Set to `lastFailureAt + window + lockout duration`, refreshed on each write. |

**Validation rules**

- `identifier` MUST be normalised before lookup or write, so that `A@b.com` and `a@b.com ` share
  one record and cannot be used to multiply the attempt budget.
- `failureCount` MUST NOT go negative.
- `lockedUntil` MUST be treated as unset when it is in the past; expiry is evaluated at read time
  and never depends on a background job having run.

**Indexes**

| Index | Type | Purpose |
|---|---|---|
| `{ identifier: 1 }` | unique | Primary lookup on every sign-in attempt. Uniqueness prevents duplicate counters racing under concurrent attempts. |
| `{ expiresAt: 1 }` | TTL, `expireAfterSeconds: 0` | MongoDB removes stale records automatically. Required because no scheduler exists on the serverless deployment targets. |

**State transitions**

```text
                 failed attempt
  (no record) ─────────────────────▶ TRACKING (failureCount = 1)
                                          │
                    failed attempt        │  failureCount < threshold
                    ◀─────────────────────┘
                                          │
                                          │  failureCount reaches threshold
                                          ▼
                                       LOCKED (lockedUntil = now + lockout)
                                          │
                       ┌──────────────────┼──────────────────┐
                       │                  │                  │
          attempt while locked    lockedUntil passes   successful sign-in
                       │                  │             (only possible
                       ▼                  ▼              once unlocked)
                 refused without      TRACKING            record reset:
                 evaluating the    (failureCount          failureCount = 0,
                 password             preserved)          lockedUntil unset
```

Two properties this must hold, both directly testable:

- A refusal while `LOCKED` MUST NOT run the password comparison (FR-014).
- A locked record MUST NOT be clearable by restarting the service or by routing the attempt to a
  different instance (FR-016).

---

## Modified entity — `User`

Current definition (`src/users/entities/user.entity.ts`) declares `role` as an unconstrained,
optional string. Since `role` is the sole input to every authorization decision under this feature,
that is too loose: an account with `role` absent, empty, or misspelled currently produces
`undefined`, which the role check must not treat as permissible.

| Field | Change | Rationale |
|---|---|---|
| `role` | `@Prop()` → `@Prop({ required: true, enum: Role, default: Role.AUTHENTICATED })` | Makes the value constrained at the persistence boundary, and makes the safe value — the *least* privileged one — the default. FR-004. |
| `password` | unchanged on the schema; excluded from serialization | The hash must never reach a response. See note below. |

**Data check required before enabling `required: true`**: existing accounts may hold a null,
absent, or non-enum `role`. A one-off read-only audit MUST run first and report any such account;
those accounts are corrected to an explicit role before the constraint is applied. This is a
verification step, not a data migration — no account's effective privilege changes.

**Password projection**: `UsersService.skipPassword` is applied on create, `findAll`, and
`findOne`, but the update path relies on `delete (await updated).password` against a Mongoose
document, which does not reliably remove the field from the serialized response. The durable fix
is a schema-level exclusion plus DTO projection, per constitution Principle II. This is flagged in
the plan's Risks as adjacent to, but not covered by, this spec's FR list — confirm before it is
picked up in `/speckit-tasks`.

---

## Unchanged entities

`Reservation`, `Item`, `Lock`, `Activity`, `ActivityType`, and `Config` are untouched by this
feature. Their *access rules* change — see
[contracts/authorization-matrix.md](./contracts/authorization-matrix.md) — but their stored shape
does not.

---

## Configuration values

Not persisted, but part of the model in the sense that the service's ability to start depends on
them. Enumerated with their validity rules in
[contracts/configuration.md](./contracts/configuration.md).

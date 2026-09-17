# Contract: Authentication Endpoints

**Feature**: `001-api-security-hardening` | **Date**: 2026-09-07

Covers `POST /api/login` and `GET /api/login/validate`. The existing request and response shapes
are preserved — this contract adds throttling behaviour and pins down failure indistinguishability.

---

## `POST /api/login`

**Access**: public. **Throttled**: yes, per account identifier.

### Request

```json
{ "email": "owner@example.com", "password": "..." }
```

Both fields required and non-empty. The email is normalised (trimmed, lower-cased) before both
account lookup and throttling lookup, so casing and padding cannot be used to multiply the attempt
budget.

### Success — `201`

Response shape is unchanged from today:

```json
{
  "access_token": "<signed token>",
  "user": { "email": "...", "id": "...", "role": "admin" }
}
```

A successful sign-in resets the account's failure streak to zero.

### Failure — `401`

```json
{ "statusCode": 401, "error": "Unauthorized", "message": "User or password incorrect." }
```

**This response MUST be identical, in both body and timing, whether the account does not exist or
the password is wrong** (FR-015). The body already is; the timing is not, because the current
implementation returns before reaching the password comparison when the account is unknown. The
implementation must perform an equivalent comparison on both paths (research R6).

*Testable form*: over a sample of attempts, the response-time distributions for "unknown account"
and "known account, wrong password" must not be separable — no order-of-magnitude gap.

### Throttled — `429`

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Too many failed sign-in attempts. Try again later.",
  "retryAfterSeconds": 900
}
```

Returned once the failure threshold is crossed, for the remainder of the lockout window.

- The password MUST NOT be evaluated on a throttled attempt (FR-014).
- The correct password supplied during a lockout MUST still be refused.
- Lockout state MUST survive a restart and be visible to every instance (FR-016).
- Every throttling decision is logged with the identifier, the outcome, and the timestamp —
  **never the attempted password** (FR-006).

**Defaults** (configurable, not hardcoded): 5 consecutive failures within a 15-minute rolling
window, then a 15-minute lockout.

---

## `GET /api/login/validate`

**Access**: any authenticated account. Unchanged in shape.

### Request

`Authorization: Bearer <token>`

### Success — `200`

```json
{ "access": true, "user": { "email": "...", "id": "...", "role": "admin" } }
```

The `role` returned MUST be the account's **current** stored role, not the value carried in the
token (FR-005). This makes the endpoint a direct, observable test of R3: demote an account, call
this endpoint with its still-valid token, and the response must show the new role.

### Failure — `401`

Missing header, malformed header, expired token, invalid signature, or an account that no longer
exists. One response shape for all of them; the reason is not disclosed.

---

## Token contract

| Property | Value | Note |
|---|---|---|
| Signing secret | `SECRET`, minimum 32 characters | Validated at startup (FR-009); the service refuses to boot below it |
| Lifetime | 24 hours | Unchanged |
| Claims | identity and role only | No other account data (constitution, Security Standards) |
| Role authority | **the account record, not the claim** | The claim remains in the token for compatibility, but authorization reads the stored role |

---

## What must not regress

- A valid sign-in with correct credentials succeeds with an unchanged response body.
- A user who mistypes their password below the threshold and then corrects it signs in normally.
- The front end's existing sign-in and token-validation calls continue to work with no change.

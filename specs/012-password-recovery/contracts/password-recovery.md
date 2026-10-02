# Contract: password recovery

**Feature**: `specs/012-password-recovery` | Source of truth after merge: `openapi.json`

Two new operations, tagged `Auth`. No existing operation changes. The checks run in this order,
so earlier refusals win: global authentication guard, role guard, route throttle, path and body
validation, then the service.

| Route | Who may call | Documented statuses |
|---|---|---|
| `POST /api/password-recovery/:userId/code` | administrator | **201**, 400, 401, 403, 404 |
| `POST /api/password-recovery/complete` | anyone (public) | **200**, 400, 429 |

Authorization matrix: rows **39** (`post /api/password-recovery/:userId/code`, `admin`) and
**40** (`post /api/password-recovery/complete`, `public`), added to
`test/security/authorization-matrix.ts` with a comment citing this contract. That follows row
38, which cites feature 002's contract rather than the 001 matrix document.

---

## Issue a recovery code

`POST /api/password-recovery/:userId/code`. Bearer token of an administrator. No body.

**201** (`RecoveryCodeResponseDto`), with header `Cache-Control: no-store`:

```json
{ "code": "042917", "expiresAt": "2026-10-01T15:04:05.000Z" }
```

- `code`: 6 digits as a string, so leading zeros survive. Returned **only** here, once.
- `expiresAt`: ISO-8601, 1 hour after issue.
- Issuing again for the same account returns a new code, and the previous one stops working.

| Case | Status | Body `message` |
|---|---|---|
| no or invalid token, or a session from before a recovery | 401 | `Unauthorized` |
| signed in, not an administrator | 403 | `You are not authorized to this page.` |
| `:userId` not a valid id | 400 | `Invalid id "<value>"` |
| no account with that id | 404 | `user #<id> not found` |

## Complete a recovery

`POST /api/password-recovery/complete`. No token needed. A token, if sent, is ignored.

Body (`CompleteRecoveryDto`). Unknown fields are refused:

```json
{ "email": "guest@example.test", "code": "042917", "newPassword": "a new passphrase" }
```

**200** (`PasswordResetResponseDto`):

```json
{ "passwordReset": true }
```

No session is returned. The client signs in through `POST /api/login` with the new password.
Every session issued for that account before this moment is now refused with 401.

| Case | Status | Body `message` |
|---|---|---|
| unknown email; no outstanding code; wrong, expired, superseded or already-used code; attempts exhausted; account deleted | **400** | `The recovery code is invalid or has expired.` (identical in every case, FR-012) |
| `email` missing or empty; `code` not exactly 6 digits; `newPassword` < 8 characters or > 72 bytes; unknown field | 400 | validation messages naming the field. The code is **not** consumed and no attempt is counted |
| more than 5 requests in 60 s from one source | 429 | `ThrottlerException: Too Many Requests` |

The fifth wrong code for an account voids its outstanding code. Even the correct code is then
refused with the generic 400 until an administrator issues a new one.

## Examples

| Step | Request | Status |
|---|---|---|
| 1 | admin `POST /api/password-recovery/<guestId>/code` | 201 `{ code: "042917", … }` |
| 2 | `POST /complete` `{ email: guest, code: "000000", newPassword: "…" }` | 400 generic |
| 3 | `POST /complete` `{ email: guest, code: "042917", newPassword: "short" }` | 400 validation (no attempt counted) |
| 4 | `POST /complete` `{ email: guest, code: "042917", newPassword: "a new passphrase" }` | 200 |
| 5 | repeat step 4 | 400 generic (used) |
| 6 | `POST /api/login` with the old password | 401 |
| 7 | `POST /api/login` with the new password | 201 |
| 8 | `GET /api/login/validate` with a token from before step 4 | 401 |
| 9 | guest `POST /api/password-recovery/<guestId>/code` | 403 |

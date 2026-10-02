# Data Model: Password Recovery

**Feature**: `specs/012-password-recovery` | Decisions: [research.md](research.md)

## PasswordRecovery (new collection `passwordrecoveries`, owned by `AuthModule`)

There is one document per account with an outstanding code. If the document exists, a code is
outstanding.

| Field | Type | Rules |
|---|---|---|
| `userId` | ObjectId | required, **unique index**. The account the code resets |
| `codeHash` | string | required. Hex `HMAC-SHA256(key, userId + ':' + code)` (R3). Never the code |
| `issuedBy` | ObjectId | required. The administrator who issued it (FR-015) |
| `issuedAt` | Date | required |
| `expiresAt` | Date | required, `issuedAt + 1 h` (FR-005). **TTL index**, `expireAfterSeconds: 0` |
| `attempts` | number | required, default 0, the incorrect submissions absorbed (FR-008) |

### Indexes

- `{ userId: 1 }` unique: every query filters on it, and it enforces "at most one outstanding
  code".
- `{ expiresAt: 1 }` TTL: cleanup only. Expiry is enforced by the query (R4).

### Lifecycle

```text
                    issue (upsert; attempts := 0)
   (none) ───────────────────────────────────────▶ OUTSTANDING
     ▲                                               │  │  │
     │ complete with correct code (findOneAndDelete) │  │  │ issue again → replaced (FR-007)
     ├───────────────────────────────────────────────┘  │  └──▶ OUTSTANDING (new code)
     │                                                  │
     │ TTL removal              wrong code: attempts += 1
     │                                                  ▼
     └──────────────── EXPIRED / VOIDED  ◀── attempts reaches 5, or now ≥ expiresAt
                       (still stored, matched by no query; refused like "no code")
```

| Transition | Operation | Guard in the filter |
|---|---|---|
| issue | `updateOne({ userId }, { $set: {…, attempts: 0} }, { upsert: true })` | none |
| complete (success) | `findOneAndDelete` | `userId, codeHash, expiresAt > now, attempts < 5` |
| wrong code | `updateOne(…, { $inc: { attempts: 1 } })` | `userId, expiresAt > now, attempts < 5` |
| expire or void | none needed | the success and wrong-code guards stop matching |

### Validation (DTOs, route-scoped `whitelist` + `forbidNonWhitelisted`)

| DTO | Field | Rule |
|---|---|---|
| (path) | `userId` | valid ObjectId (`ParseObjectIdPipe`) → otherwise 400 |
| `CompleteRecoveryDto` | `email` | string, non-empty, ≤ 254 |
| | `code` | string matching `/^\d{6}$/` |
| | `newPassword` | string, ≥ 8 characters, ≤ 72 bytes (UTF-8) |

## User (existing, `users`): changes

| Change | Detail |
|---|---|
| new field `passwordChangedAt` | `Date`, optional, **`select: false`**. Set by recovery only. Absent means the account has never been recovered, so every session is accepted (spec US3 scenario 3) |
| new index | `{ email: 1 }` **non-unique** (R11). It can't be unique while D13 duplicates may exist |

Projection: `passwordChangedAt` is excluded by default, so no user response and no user route
contract changes. `UsersService.findById` selects it for `JwtStrategy`.

Writers: **only** `UsersService.resetPassword`. `create` and `update` drop the field from
client input (research R13). Otherwise `PUT /api/users/:id` could set it to a future date and
lock the account out of every session.

### Session rule (FR-013)

```text
refuse  ⇔  user.passwordChangedAt is set  AND  token.iat < floor(passwordChangedAt / 1000)
```

`iat` is in whole seconds (research O2). A token from the same second as the reset is accepted.

# Data Model: Field Kinds in Request Bodies

**Feature**: `specs/014-fix-mistyped-fields` | **Date**: 2026-10-02

No schema, index or stored data changes. This is the set of body fields and the kind each
accepts, which is what the feature enforces. The kinds are the ones the contract
(`openapi.json`) already declares.

## Rules

1. **Kind**: a field accepts only a JSON value of its kind. Nothing is converted.
   - **text**: a JSON string
   - **number**: a JSON number
   - **yes/no**: `true` or `false`
   - **date**: a string that is strict ISO 8601 and a real date (R3)
   - **id**: a 24-hex record id string
   - **entries**: a JSON array of checklist entries, each checked by the entry rules
2. **Create**: a field marked *required* must be present. `null` is refused for every field
   except those marked *nullable*.
3. **Change** (partial DTOs): every field may be omitted. A field that is sent is checked
   exactly as on create, so `null` is refused unless the field is *nullable* (R5).
4. **Other rules** (not empty, ranges, digits, enum values, lock reference) are unchanged and
   run as today.
5. **Message**: each refusal names the field (`label must be a string`,
   `items.0.status must be a boolean value`, `dateIni must be a date in ISO 8601 format`).
   Several bad fields are listed in one 400.

## Fields

### Item (`POST /api/items`, `PUT /api/items/:id`) and reservation entry (`items[]`)

| Field | Kind | Create | Nullable | Other rules |
|---|---|---|---|---|
| `label` | text | required | no | not empty |
| `status` | yes/no | required | no | |
| `checked` | yes/no | optional, default `false` | no | |
| `description` | text | required | no | |
| `comments` | text | optional, default `""` | no | |
| `category` | text | required | no | |
| `_id` (entry only) | id | optional | no | the entry's own id (spec 010) |

### Reservation (`POST /api/reservations`, `PUT /api/reservations/:id`)

| Field | Kind | Create | Nullable | Other rules |
|---|---|---|---|---|
| `dateIni`, `dateEnd` | date | required | no | availability checked after |
| `type` | text | required | no | not empty |
| `validated` | yes/no | required | no | |
| `contact` | text | required | no | not empty |
| `userLock` | text | optional | **yes**: empty removes the lock | lock slot or lock id |
| `quantity` | number | required | no | 1–8 |
| `cost` | number (**new check**) | optional | **yes** | |
| `items` | entries | required | no | entry rules above |

### Lock (`POST /api/locks`, `PUT /api/locks/:id`)

| Field | Kind | Create | Nullable | Other rules |
|---|---|---|---|---|
| `lock` | text (**new check**) | required | no | digital number < 10000 |
| `userNumber` | text (**new check**) | required | no | digital number < 20 |

### Activity type (`POST /api/activity-type`, `PUT /api/activity-type/:id`)

| Field | Kind | Create | Nullable | Other rules |
|---|---|---|---|---|
| `name` | text | required | no | |
| `budget` | number | required | no | ≥ 0 |
| `description` | text | optional | **yes** | |

### Activity (`POST /api/activity`, `PUT /api/activity/:id`)

| Field | Kind | Create | Nullable | Other rules |
|---|---|---|---|---|
| `type` | id | required | no | |
| `status` | text | required | no | `TODO` or `COMPLETED` |
| `price` | number | required | no | |
| `date` | date | required | no | |
| `description` | text | optional | **yes** | |

### Configuration (`POST /api/config`, `PUT /api/config/:id`)

| Field | Kind | Create | Nullable |
|---|---|---|---|
| `doorLock`, `mainLock` | text | required | no |
| `usersLimit`, `analogLecture` | number | required | no |

### Device reading (`PATCH /api/config/:id`, not partial)

| Field | Kind | Required |
|---|---|---|
| `analogLecture` | number | yes |
| `apiKey` | text | yes. A well-typed wrong key is still 404 (D10) |
| `time` | number | yes |

### Account (`POST /api/users`, `PUT /api/users/:id`)

| Field | Kind | Create | Change |
|---|---|---|---|
| `email`, `name`, `password` | text | required | required (D9) |
| `role` | text | required | required. An unknown text role is still 500 (D12) |
| `changePassword` | yes/no | n/a | required (D9) |
| `currentPassword` | text | n/a | required (D9) |

### Recovery completion (`POST /api/password-recovery/complete`)

`email`, `code` and `newPassword`: text, required. Their rules are unchanged (spec 012).

## Refusal order (unchanged)

1. Throttle (sign-in and recovery only): 429
2. Guards: 401, then 403
3. Path id: 400 `Invalid id "<value>"`
4. Body: 400 for an undeclared field (spec 010) and wrongly typed or `null` fields (this
   feature), reported together
5. Service: 404 unknown id, 400 `Reservation not available`, 404 `Invalid API Key`, 406 (D16)

# Quickstart: Validate Wrongly Typed Fields

**Feature**: `specs/014-fix-mistyped-fields`

The field rules are in [data-model.md](data-model.md), and before/after in
[contracts/request-types.md](contracts/request-types.md).

## Prerequisites

```sh
corepack enable pnpm && pnpm install
```

Run commands through `zsh -ic '…'` on this WSL checkout (Node 24 via fnm).

## 1. Automated proof

```sh
pnpm test src/common/pipes src/validators                    # pipe + IsDateText unit specs
pnpm test:e2e test/records/field-types.e2e-spec.ts            # the new suite
pnpm test:e2e test/docs                                       # D8 pin gone; docs checks green
pnpm test:e2e test/records/unknown-fields.e2e-spec.ts         # inverted "false" case
pnpm build && pnpm docs:check                                 # expect: openapi.json is up to date
```

Expected: all green. `field-types` fails on today's code (500 and silent 2xx) before the fix.

## 2. By hand against the local server

```sh
pnpm db:setup && pnpm start:dev
TOKEN=$(curl -s localhost:3000/api/login -H 'content-type: application/json' \
  -d '{"email":"dev.admin@localhost.test","password":"<seeded password>"}' | jq -r .access_token)
H=(-H "Authorization: Bearer $TOKEN" -H 'content-type: application/json')
ID=$(curl -s "${H[@]}" localhost:3000/api/items \
  -d '{"label":"Towels","status":true,"description":"d","category":"c"}' | jq -r ._id)
```

| # | Request | Expect |
|---|---|---|
| 1 | `PUT /api/items/$ID` `{"label":{"not":"a string"}}` | 400 `label must be a string` (was 500) |
| 2 | `PUT /api/items/$ID` `{"status":"abc"}` | 400 `status must be a boolean value` (was 500) |
| 3 | `PUT /api/items/$ID` `{"label":7}` | 400, then `GET` shows the label unchanged |
| 4 | `PUT /api/items/$ID` `{"label":null}` | 400, label unchanged |
| 5 | `PUT /api/items/$ID` `{"label":"Sheets"}` | 200, `checked` and `comments` untouched |
| 6 | `POST /api/reservations` with `"dateIni":"2031-05-01T00:00:00.000"` (app format) | 201 |
| 7 | the same with `"dateIni":7`, `true`, `"2026-02-30"` or `"20260101"` | 400 naming `dateIni` |
| 8 | `PUT /api/reservations/:id` `{"cost":"abc"}` | 400 (was 500) |
| 9 | `PUT /api/reservations/:id` `{"userLock":null}` | 200, lock removed |
| 10 | `POST /api/locks` `{"lock":1234,"userNumber":"3"}` | 400 `lock must be a string` |
| 11 | `PATCH /api/config/:id` `{"analogLecture":"1","apiKey":"x","time":1}` | 400; with `analogLecture:1` it is 404 `Invalid API Key` (D10) |

## 3. Mobile app smoke test (before merging to `main`)

With the app pointed at a preview deployment, do one save on each edit screen:
- reservation: create, edit with a lock, validate, then clear the lock;
- item check-off inside a reservation;
- lock, activity, activity type and account edit;
- an account password change.

Each must save as before. A 400 here means the app sends a kind R7 missed, so stop and record
it.

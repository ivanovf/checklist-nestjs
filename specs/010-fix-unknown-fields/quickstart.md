# Quickstart: Validating "Refuse Unknown Fields in Requests"

## Prerequisites

`corepack enable pnpm`, `pnpm install`, and for the manual checks a local stack
(`pnpm db:setup`, `pnpm start:dev`) and an admin token:

```sh
TOKEN=$(curl -s localhost:3000/api/login -H 'content-type: application/json' \
  -d '{"email":"dev.admin@localhost.test","password":"<seed password>"}' | jq -r .access_token)
H=(-H "Authorization: Bearer $TOKEN" -H 'content-type: application/json')
```

## Automated

```sh
pnpm exec jest src/common src/openapi src/reservations      # pipe, interceptor, contract helper, lock validator
pnpm test:e2e -- test/records/unknown-fields                # bodies, own _id, queries, precedence
pnpm test:e2e -- test/reservations/reservation-lock
pnpm test:e2e -- test/docs                                  # closed schemas match behaviour; D5/D15 pins gone
pnpm docs:check
VERIFY_E2E=1 pnpm verify                                    # all gates on the committed HEAD
```

## Manual scenarios

Expected answers are in [contracts/request-rules.md](contracts/request-rules.md) §5.

| # | Request | Expected |
|---|---|---|
| 1 | `POST /api/items` with a valid body plus `"notAField":1` | 400, no item created |
| 2 | `POST /api/items` with `"_id":"64b000000000000000000001"` | 400 |
| 3 | `PUT /api/locks/<id>` with `{"_id":"<id>","lock":"1","userNumber":"2"}` (the app's shape) | 200 |
| 4 | the same with a different `_id` | 400 `_id must match the id in the path` |
| 5 | create an item, `PUT {"checked":true,"comments":"ok"}`, then `PUT {"label":"x"}` | `checked` and `comments` kept |
| 6 | `POST /api/reservations` with `"userLock":"03"` and items carrying `_id`; `GET` it | `userLock: "03"`, item ids kept |
| 7 | `PUT` that reservation with `"userLock":""`, then `GET` | no `userLock` |
| 8 | `POST /api/reservations` with `"lockUser":"3"` | 400 |
| 9 | `GET /api/items/all?limit=5&offset=0&foo=1` | 400; without `foo`, 200 |
| 10 | `GET /api/config?limit=5&offset=0&foo=1` | 400; without `foo`, 200 |
| 11 | no token plus `notAField` | 401 |
| 12 | **Mobile app** against `pnpm start:dev`: edit a reservation (checklist plus lock), a lock code, an activity and an activity type; browse each list | everything saves and loads as before |

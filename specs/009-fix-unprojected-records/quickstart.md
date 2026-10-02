# Quickstart: Validating Feature 009

How to prove the feature works. Shapes are in [data-model.md](data-model.md), and interfaces
in [contracts/record-responses.md](contracts/record-responses.md).

## Prerequisites

`corepack enable pnpm`, `pnpm install`, and a filled `.env.local` (see `env.example`). The e2e
suites need no database (they use `mongodb-memory-server`). The manual checks need `pnpm db:setup`.

## 1. Automated proof

```sh
pnpm test                                                    # projection + D17 unit tests
pnpm exec jest --config ./test/jest-e2e.json --runInBand test/records   # 29 operations, D17, repair
pnpm test:e2e                                                # full suite, including test/docs
pnpm build && pnpm docs:check                                # openapi.json matches the code
```

Expected:
- `test/records/record-fields.e2e-spec.ts`: 29 operations pass. No `__v` or `password` at any
  depth, and every key is in the contract.
- `test/records/account-password.e2e-spec.ts`: after `changePassword: false`, the previous
  password signs in (201) and the sent value doesn't (401).
- `test/records/password-repair.e2e-spec.ts`: the dry run changes nothing, apply repairs only the
  plain-text accounts, a second run reports 0, and no secret appears in the output.
- `contract-discrepancies.e2e-spec.ts` no longer has a D3 case.
- `docs:check` passes against the regenerated `openapi.json`, and `grep -c '"__v"' openapi.json`
  prints `0`.

## 2. Manual check against the local API

```sh
pnpm start:dev
# sign in as dev.admin@localhost.test, then:
curl -s -H "Authorization: Bearer $T" 'http://localhost:3000/api/users/all?limit=1' | jq '.[0] | keys'
```

Expected: `["_id","createdAt","email","name","role","updatedAt"]`, with no `__v`.

## 3. Repair, on local data

```sh
# make a defective account the way production got them (a changePassword:false update), then:
NODE_ENV=local pnpm db:repair-passwords            # lists it, changes nothing, exits 1
NODE_ENV=local pnpm db:repair-passwords --apply    # repairs it, exits 0
NODE_ENV=local pnpm db:repair-passwords            # reports 0, exits 0
```

The repaired account then signs in with the text that had been stored. Running against production
(`NODE_ENV=production`, with the production env file) is the owner's decision. Do the dry run
first and read the list.

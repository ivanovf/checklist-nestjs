# Quickstart: validating password recovery

**Feature**: `specs/012-password-recovery` | Contract: [contracts/password-recovery.md](contracts/password-recovery.md)

## Automated

```sh
pnpm install                       # this worktree has no node_modules yet
pnpm test src/auth src/users       # unit: recovery service and controller, strategy, both schemas, users service
pnpm test:e2e password-recovery    # e2e against mongodb-memory-server (--runInBand)
pnpm test:e2e docs security        # contract completeness, matrix rows 39–40, refusals
pnpm docs:export && git diff --stat openapi.json   # only the two new operations and their DTOs
VERIFY_E2E=1 pnpm verify           # all gates, committed HEAD, clean tree
```

The e2e suite `test/auth/password-recovery.e2e-spec.ts` is expected to prove these, each as its
own test:

| Spec | Scenario | Expected |
|---|---|---|
| US1-1 | admin issues for a guest | 201, 6-digit `code`, `expiresAt` about 1 h ahead, `Cache-Control: no-store` |
| US1-2,3 | complete, then sign in with new and old | 200 `{passwordReset:true}`; new 201, old 401 |
| US1-4 | reuse the code | 400 generic |
| US2-1 | guest and anonymous try to issue | 403, 401; no document created |
| US2-2 / SC-004 | unknown email, no code, wrong code | identical status and body |
| US2-3 | code past `expiresAt` (set the stored date back) | 400 generic |
| US2-4 | 5 wrong codes, then the right one | 400 ×5, then 400 generic |
| US2-5 | issue twice, use the first | 400; the second works |
| US2-6 | 6 completions in a minute | 5 processed, then 429 |
| US3-1,2,3 | old token after recovery; new token; an account never recovered | 401; 200; 200 |
| Edge | two parallel completions with one valid code | exactly one 200 |
| Edge | short or 73-byte password, extra field | 400 validation; the code still works afterwards |
| Edge | account deleted after issue | 400 generic |
| Edge | upper-cased email on completion, and on sign-in | 400 generic; sign-in 401 |
| Edge | two parallel issues for one account | both 201; one document; exactly one code works |
| R13 | guest `PUT /api/users/<id>` or admin `POST /api/users` with `passwordChangedAt` | not stored; the target's sessions keep working |
| SC-008 | captured log lines during the suite | contain no code, password or email |

## Manual (local)

```sh
pnpm db:setup && pnpm start:dev
TOKEN=$(curl -s localhost:3000/api/login -H 'content-type: application/json' \
  -d '{"email":"dev.admin@localhost.test","password":"<seed password>"}' | jq -r .access_token)
GUEST=<id of a non-admin account>   # create one via POST /api/users if needed

curl -si -X POST localhost:3000/api/password-recovery/$GUEST/code -H "Authorization: Bearer $TOKEN"
#  → 201, Cache-Control: no-store, {"code":"NNNNNN","expiresAt":"…"}

curl -si localhost:3000/api/password-recovery/complete -H 'content-type: application/json' \
  -d '{"email":"<guest email>","code":"NNNNNN","newPassword":"a new passphrase"}'
#  → 200 {"passwordReset":true}; repeat → 400 "The recovery code is invalid or has expired."
```

Then check in the server log that you see `password_recovery.issued` and
`password_recovery.completed` lines naming account ids only.

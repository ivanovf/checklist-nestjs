# Implementation Plan: Stored Records Answered Only With Their Published Fields

**Branch**: `009-fix-unprojected-records` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-fix-unprojected-records/spec.md`

## Summary

Two fixes, both found on the account routes:

- **D3 (#9)**: every one of the 29 record-returning operations sends the stored document as is,
  `__v` included. Each service will finish by projecting its result through an explicit,
  compiler-checked field list per response DTO, so only published fields leave it (research R2,
  R3). The `*-response.dto.ts` classes lose `__v`, stop being documentation-only, and generate the
  regenerated `openapi.json`.
- **D17 (new)**: `PUT /api/users/:id` with `changePassword: false` stores the sent `password` as
  plain text and locks the account out (observed). The update will write only the account's own
  fields, and the password only on a verified change (R6). A one-off, dry-run-first repair hashes
  existing plain-text passwords in place (R7).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node 24.x

**Primary Dependencies**: NestJS 10, Mongoose 8, bcrypt 6, `@nestjs/swagger` 7 with its CLI
plugin. No new dependency.

**Storage**: MongoDB (Atlas in production, Docker locally, `mongodb-memory-server` in e2e). No
schema change.

**Testing**: jest unit (`src/**`), jest e2e `--runInBand` (`test/**`), and the `test/docs`
contract suites

**Target Platform**: Vercel serverless (the API). The repair is a local `ts-node` command.

**Project Type**: web service (REST API)

**Performance Goals**: within the existing budgets (read p95 < 300 ms, write p95 < 500 ms).
Projection is an in-memory copy of at most 50 records per page.

**Constraints**: byte-identical JSON for every published field (SC-004), no `any`, and coverage
at least 80% overall and 90% for `src/auth`

**Scale/Scope**: 29 operations across 7 modules, 9 response DTOs, 1 account-update path, 1 repair
command

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Test-first | ✅ | The new e2e suites (29-operation field conformance, D17 sign-in, repair) and the unit tests (projection allowlists, `UsersService.update` write set) are written and seen failing first. The D3 discrepancy test is removed when its replacement is green. |
| II. Layering | ✅ | This is the principle's own rule: "Mongoose documents MUST NOT be returned raw from controllers". Projection lives in services (R3), controllers stay HTTP-only, and there's no `any`. |
| III. Secure by default | ✅ ⚠️ flagged | The password can no longer reach an answer through any path (FR-005), and it is only ever stored as a hash (FR-011). **Flag**: "production credentials MUST NOT be usable from a developer machine", so the repair can't be run against production from a laptop as designed. Where it runs is the owner's call (see Open item). |
| IV. Validated, documented contracts | ✅ ⚠️ flagged | Responses now match the contract, and `openapi.json` is regenerated in the same PR. Removing `__v` changes a published required field. The owner confirmed in place (Clarifications 2026-10-01), because the app doesn't read it. Flagged in the PR. `ActivityResponseDto.type` becomes nullable, documenting observed behaviour. |
| V. Performance and observability | ✅ | No new queries and no N+1: the populate stays a single query. The repair prints ids and counts only. No passwords, hashes or emails reach logs. |
| Data protection | ✅ | Synthetic test data only. The repair's output carries no personal data. |
| `src/auth/**` review | ✅ n/a | No change under `src/auth`. `UsersService` lives in `src/users`. Sign-in is exercised by tests but not modified. |
| Workflow | ✅ | Feature branch, PR, `VERIFY_E2E=1 pnpm verify`, and the e2e result stated in the PR |

**Result**: PASS, with two items flagged for the PR (III, IV).

**Re-check after design**: PASS, unchanged.

### Open item for the owner (doesn't block implementation)

The repair is built and proven against the in-memory and local databases. To run it on
production without breaking the developer-machine rule, the options are: a short-lived,
least-privilege Atlas user created for the run and deleted afterwards; or running it from an
environment already trusted with production credentials. That's an operational decision, recorded
in the PR rather than in code.

## Project Structure

### Documentation (this feature)

```text
specs/009-fix-unprojected-records/
├── plan.md              # this file
├── research.md          # R1–R8
├── data-model.md        # published shapes, password states
├── quickstart.md        # validation guide
├── contracts/
│   └── record-responses.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── common/
│   └── projection.ts                  # NEW: typed pick helper (allowlist, skips undefined)
├── users/
│   ├── dto/user-response.dto.ts       # __v removed; becomes the projection target
│   ├── users.service.ts               # project answers; update writes an explicit field set (D17)
│   ├── password-repair.ts             # NEW: repairPlainTextPasswords(model, { apply })
│   └── password-repair.spec.ts        # NEW
├── items/      dto/item-response.dto.ts, items.service.ts               # project
├── locks/      dto/lock-response.dto.ts, locks.service.ts               # project
├── reservations/ dto/reservation-response.dto.ts, reservations.service.ts  # project (+ nested items)
├── config/     dto/config-response.dto.ts, config.service.ts            # project
├── activity-type/ dto/activity-type-response.dto.ts, activity-type.service.ts  # project
└── activity/   dto/activity-response.dto.ts, activity.service.ts        # project (+ nested type, nullable)

scripts/
└── repair-plain-passwords.ts          # NEW: thin runner (seed-dev-admin pattern)

test/
├── records/
│   ├── record-fields.e2e-spec.ts      # NEW: all 29 operations against the contract
│   ├── account-password.e2e-spec.ts   # NEW: D17 sign-in regressions
│   └── password-repair.e2e-spec.ts    # NEW: repair against mongodb-memory-server
└── docs/contract-discrepancies.e2e-spec.ts   # D3 case removed

openapi.json                            # regenerated (pnpm docs:export)
package.json                            # + "db:repair-passwords" script
specs/005-openapi-contract-export/discrepancies.md   # D3 resolved; D17 recorded and resolved
```

**Structure Decision**: the existing single NestJS project. One response DTO per module, as
today, and a shared helper in `src/common`. The repair follows the `seed-dev-admin` split, so its
logic is unit-tested under `src/` and its runner stays thin.

## Complexity Tracking

No violations need justifying.

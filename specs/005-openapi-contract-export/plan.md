# Implementation Plan: Accurate, Exported API Contract

**Branch**: `005-openapi-contract-export` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-openapi-contract-export/spec.md`

## Summary

Make the OpenAPI document accurate, export it to a committed `openapi.json` without a
database, and stop it drifting.

The document is generated from the real `AppModule` in Nest **preview mode**, from
`nest build` output. Preview mode needs no database. The build is required because the
Swagger CLI plugin only runs there. Research R1 and R2 both confirmed this by running
it: the output was byte-identical to the live `/docs-json`.

Routes gain documentation-only metadata: summaries, typed response classes, and a new
`@ApiRefusals(...)` decorator. Where code and behaviour disagree, the contract states the
**observed** behaviour, and the disagreement goes into a discrepancy register.

Checks:
- `pnpm docs:check` guards drift inside the Build gate.
- Data-only checks in `test/docs/` enforce completeness and agreement with the existing
  access matrix.
- A small execution sample, plus one test per discrepancy, proves the contract against a
  running app (FR-015, option B).

No runtime behaviour changes.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict) on Node 24.x

**Primary Dependencies**: NestJS 10.4, `@nestjs/swagger` 7.3 with its CLI plugin
(already configured in `nest-cli.json`). **No new dependencies.**

**Storage**: N/A. The feature reads no data. The e2e sample uses the existing
`mongodb-memory-server` setup.

**Testing**: Jest 29 + ts-jest.
- Unit tests: `src/**/*.spec.ts`, for the decorator, the document builder, and the
  replaced controller specs.
- E2E: `test/docs/*.e2e-spec.ts`, for the contract checks, the sample, and the
  discrepancies.

**Target Platform**: Contract consumers (the Flutter client, AI agents) read a static
file. The API itself still deploys to Vercel serverless, unchanged.

**Project Type**: Web service (single NestJS project)

**Performance Goals**:
- `docs:export` under 1 min on CI's native filesystem (SC-004). It is slower from
  `/mnt/c` (R9).
- The data-only checks take milliseconds.

**Constraints**:
- Zero runtime behaviour change (FR-012).
- The export uses no secrets and no database (FR-009).
- The output is byte-deterministic across OSes (FR-010, R4).

**Scale/Scope**:
- 38 operations across 10 controllers.
- About 10 response classes.
- 6 definedness-only controller specs to replace (Principle I).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Rule | Assessment | Status |
|---|---|---|
| **I. Test-First** (NON-NEGOTIABLE) | Every check is written to fail first. The completeness and access checks fail on today's document, which is the red state. Six controllers have definedness-only specs (activity, config, items, locks, reservations, users). Adding decorators modifies them, so those specs **must be replaced** with routing, guard and binding assertions in this feature. This is scope the constitution adds, flagged below | ✅ Pass, with added scope |
| **II. Layered Architecture** | Only controller metadata and documentation-only classes change. Services and models are untouched. Responses stay unprojected; that is recorded as D3, not fixed | ⚠️ Deviation recorded (see Complexity Tracking) |
| **III. Secure By Default** | No secret enters the file: placeholder config, no `.env` read. Check 5 forbids `password` in any response schema. Sign-in documentation touches `src/auth/controllers/auth.controller.ts` → **security review required before merge** | ✅ Pass, review required |
| **IV. Validated, Documented Contracts** | This feature *is* this principle's "every endpoint MUST carry Swagger metadata … including its error cases" and "stay in sync". Untyped `@Query` binding (D4) and the missing `whitelist`/`forbidNonWhitelisted` on the global pipe are pre-existing violations, recorded, not fixed | ✅ Advances. ⚠️ Pre-existing violations recorded |
| **V. Observability & Performance** | No runtime change. List endpoints are not re-paginated here | ✅ N/A |
| **Security & Data Protection** | No personal data is used. E2E fixtures are synthetic, as they already are. `openapi.json` holds no secret | ✅ Pass |
| **Quality gates** | Still five: `docs:check` is folded into the Build gate. CI edits `pnpm build` → `pnpm build && pnpm docs:check` | ✅ Pass |
| **New dependency** | None. Preview mode and the Swagger plugin are built in | ✅ Pass |
| **Governance: "correct when next touched"** | These controllers are touched, but only their metadata. Fixing D1–D4 changes behaviour, which the spec excludes (FR-012). They are recorded as issues in `discrepancies.md`, per "existing violations … are recorded as issues" | ⚠️ Deviation. Needs reviewer acknowledgement in the PR |

**Gate result**: PASS with two recorded deviations. Both are justified below and must be
flagged in the PR description, as the workflow rules require.

**Post-design re-check (after Phase 1)**: unchanged. The design adds no dependency, no
runtime path, and no new gate. Research R3 moved the data-only checks from the unit gate
to the e2e gate. Neither gate's constitutional meaning changes, and the unit coverage
floors are unaffected (R10).

## Project Structure

### Documentation (this feature)

```text
specs/005-openapi-contract-export/
├── spec.md
├── plan.md                 # this file
├── research.md             # R1–R10
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── commands.md                    # docs:export, docs:check
│   └── documentation-conventions.md   # decorators, @ApiRefusals, the 7 checks
├── discrepancies.md        # created during implementation, D1–D4 seeded (research R7)
├── checklists/requirements.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
openapi.json                          # NEW, generated, committed
.gitattributes                        # NEW: openapi.json text eol=lf
.prettierignore                       # + openapi.json
package.json                          # + docs:export, docs:check; coverage excludes export.ts
.github/workflows/ci.yml              # Build step: pnpm build && pnpm docs:check
CLAUDE.md                             # FR-016: convention and test/docs/ now real, commands listed

src/
├── bootstrap.ts                      # uses the shared document builder (no behaviour change)
├── openapi/
│   ├── openapi-document.ts           # NEW: DocumentBuilder config + createDocument, shared
│   ├── openapi-document.spec.ts      # NEW
│   └── export.ts                     # NEW: preview-mode entry for docs:export / docs:check
├── common/
│   ├── decorators/api-refusals.decorator.ts (+ .spec.ts)   # NEW
│   └── dto/error-response.dto.ts                           # NEW, docs-only
├── auth/
│   ├── controllers/auth.controller.ts        # + @ApiBody, responses  ← security review
│   └── dto/login-request.dto.ts, login-response.dto.ts     # NEW, docs-only
└── <module>/                          # users, items, reservations, locks, config,
    ├── <module>.controller.ts         #   activity, activity-type, health, app
    ├── <module>.controller.spec.ts    # replaced where definedness-only (6)
    └── dto/<entity>-response.dto.ts   # NEW, docs-only

test/docs/
├── openapi-contract.ts               # NEW: loads openapi.json, helpers
├── contract-completeness.e2e-spec.ts # checks 1–5 (data-only)
├── contract-sample.e2e-spec.ts       # check 6 (running app, transport: true)
└── contract-discrepancies.e2e-spec.ts# check 7, one test per D-entry
```

**Structure Decision**: single NestJS project, following existing layout. The exporter
sits under `src/openapi/` so `nest build` compiles it with the Swagger plugin (R2).
Contract checks live in `test/docs/`, the location CLAUDE.md already names, and use the
e2e config, where `AUTHORIZATION_MATRIX` is already importable (R3).

## Implementation Order (for /speckit-tasks)

1. **US1 foundation**: shared document builder → `export.ts` → `docs:export` /
   `docs:check` → first `openapi.json` (today's thin document) → `.gitattributes`,
   `.prettierignore`, CI step. Delivers offline reading immediately, drift-guarded.
2. **Checks red**: `test/docs` completeness and access checks, written against the thin
   document. They fail. This is the test-first state for US2.
3. **US2 per module**: observe → record discrepancies → decorators, response classes,
   `@ApiRefusals` → replace the definedness-only controller spec → re-export → checks go
   green for that module. Order: auth (sign-in) → users → items → reservations → locks →
   config → activity-type → activity → health/app.
4. **Execution proof**: sample and discrepancy e2e tests.
5. **FR-011 issues**: open one GitHub issue per `discrepancies.md` entry (D1–D4, plus
   any found in step 3), and record each number in the register.
6. **FR-016**: CLAUDE.md corrections. PR description flags both deviations and the
   `src/auth` security review.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Responses stay unprojected (Principle II, D3), and query values stay untyped (Principle IV, D4), although the controllers are touched | The spec excludes behaviour change (FR-012). Projecting or typing inputs changes response bodies and validation outcomes for the live Flutter client | Fixing them here mixes a contract-documentation change with behaviour changes. That makes both harder to review, and makes the contract describe a moving target. They are recorded in `discrepancies.md` as issues, and each has a proving test that fails the moment someone fixes it, forcing the contract update |
| Missing-item 200 with an empty body (D2) and required-despite-default paging (D1) are **documented as correct** | FR-006: the contract must describe real behaviour. Documenting intended behaviour would make the contract lie to consumers | Documenting the intent instead is exactly the "authoritative but wrong" failure the feature exists to remove |

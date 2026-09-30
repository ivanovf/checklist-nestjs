# Research: Honest Answers for Unknown and Malformed Record Ids

**Feature**: `specs/008-fix-unknown-id-404` | **Date**: 2026-09-30

The behaviour tables in `spec.md` were observed by running all 20 by-id operations
(e2e harness, in-memory Mongo, `configureApp`) with an unknown well-formed id and with `abc`.
The account and activity change operations were re-run with valid bodies. The probes were
discarded.

## R1 — Root cause of the false successes (D2)

**Finding**: In items, locks, reservations and config, the check is:

```ts
const doc = this.model.findById(id);          // or findByIdAndUpdate(...).exec()
if (!doc) throw new NotFoundException(...);   // doc is a Query or a Promise, never falsy
return doc;
```

The query or promise is never awaited, so `!doc` is always false and the not-found branch can
never run. The controller then resolves the query to `null`, and Nest sends that as **200 with
an empty body**. `remove` returns `{ deleted: true }` whatever the query finds.

`activity-type` (all three operations) and `activity.update` have no check at all.
`users` (all three) and `activity` `findOne`/`remove` await first, which is why they already
answer 404.

## R2 — Root cause of the server errors and false deletions (D7)

**Finding**: A malformed id makes Mongoose throw a `CastError` when the query runs. No filter
maps it, so it surfaces as **500**. In items, locks and reservations `remove`, the rejected
`exec()` promise is never awaited: the response is already `{ deleted: true }`, and the
rejection goes unhandled. `activity.remove` throws a plain `Error('Invalid id')`, which is
also a 500.

## R3 — Where to reject a malformed id

**Decision**: A new `ParseObjectIdPipe` in `src/common/pipes/`, bound as
`@Param('id', ParseObjectIdPipe)` on all 20 operations. It uses `Types.ObjectId.isValid(id)`
plus a round-trip check, so 12-character strings that `isValid` accepts are refused too. It
throws `BadRequestException('Invalid id "<value>"')`.

**Rationale**:
- Pipes run **after** guards, so 401 and 403 keep their precedence (FR-005).
- It is an HTTP-edge concern, so it belongs at the controller boundary rather than in each
  service (Principle II).
- One definition serves all 20 bindings.
- `@nestjs/mongoose` 10.0.6 ships no such pipe; one arrives only in later majors, and
  upgrading is out of scope.

**Precedence with the body**: Nest resolves a handler's parameters together, and a pipe
that throws synchronously wins. So on a change request with **both** a malformed id and an
invalid body, the answer is the id's 400. Both are 400, so no status changes. With a
**well-formed unknown** id and an invalid body, the body's 400 comes first, because the
404 check lives in the service (spec Edge Cases).

**Alternatives considered**:
- *A global exception filter that maps `CastError` to 400*: rejected. It would catch cast
  errors from anywhere, including bodies (it would hide D8, #13), and it would still let the
  three DELETE routes answer `{ deleted: true }` before the error happens.
- *Checking inside each service*: rejected. That repeats one rule 20 times and puts HTTP
  parsing in the service layer.

## R4 — Where to answer "not found"

**Decision**: In each service, await the query, then
`if (!doc) throw new NotFoundException('<kind> #<id> not found')`. Use the existing
`users` wording, lower-case kind: `item`, `lock`, `reservation`, `config`,
`activity type`. The existing messages for `users` and `activity` stay unchanged (FR-006).

- `remove` awaits `findByIdAndDelete`, and returns `{ deleted: true }` only when a document
  came back (FR-003).
- `activity.remove` drops its `Error('Invalid id')` branch, which the pipe now makes
  unreachable.
- `update` keeps `findByIdAndUpdate(..., { new: true })` without `upsert`, so an unknown id
  never creates a record (FR-004).

**Rationale**: Only the service knows whether the record exists (Principle II). Awaiting is
also what turns the unhandled rejection in R2 into a handled one.

## R5 — The account change path with `changePassword`

**Finding** (from reading the code; the implementation proved it wrong): the plan-phase guess
was that `UsersService.update` with `changePassword: true` would be a 500 for an unknown id,
because it reads `user.password` after `findWithPassword(id)`. In fact `findWithPassword`
already awaits and throws `user #<id> not found`, so that path is **already a 404**.

**Decision**: No code change. The regression tests in T002(b) and T005 pin the 404 for both
`changePassword` values.

## R6 — Contract and tests

**Decision**:
- Each of the 20 operations documents **400** and **404** through `@ApiRefusals`, keeping
  its access statuses. `test/docs` check 4 already allows both.
- The device route (`PATCH /api/config/:id`) keeps its 404: it has two sources, an unknown id
  and D10's wrong key.
- The two D2 tests and the D7 test in `contract-discrepancies.e2e-spec.ts` are removed.
- A new suite, `test/records/record-ids.e2e-spec.ts`, covers all 20 operations with an unknown
  id and with `abc`, plus one real round trip per kind: create, read, delete, then read and
  delete again, which answers 404.
- The authorization matrix only asserts "not 401/403" for allowed callers, so the new 404s
  on its unknown id don't affect it.

**Also**: `CLAUDE.md` warns that several by-id routes return 200 with an empty body. That line
becomes untrue, so it is updated.

## R7 — Compatibility (Principle IV)

Turning false 200s into 404, and 500s into 400, corrects answers that were wrong. The 005
contract recorded those answers only as known defects (D2, D7). Treat this as a defect fix, not
a versioned change, as in 006 and 007, and flag it in the PR. A client that relied on an empty
200 for a missing record now gets a 404.

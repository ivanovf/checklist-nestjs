# Data Model: Honest Answers for Unknown and Malformed Record Ids

**Feature**: `specs/008-fix-unknown-id-404` | **Date**: 2026-09-30

No stored data, schema or index changes.

## Record id (`:id` path value)

| State | Test | Answer |
|---|---|---|
| malformed | not a 24-hex MongoDB ObjectId (`ParseObjectIdPipe`) | **400** `Invalid id "<value>"` |
| well-formed, unknown | the service's awaited query returns nothing | **404** `<kind> #<id> not found` |
| well-formed, existing | found | unchanged from today |

The order is: authentication (401) → role (403) → id format (400) → body validation (400) → existence (404).

## Not-found messages

| Kind | Message | Status |
|---|---|---|
| account | `user #<id> not found` | unchanged |
| activity | `Activity not found` | unchanged |
| item | `item #<id> not found` | new |
| lock | `lock #<id> not found` | new |
| reservation | `reservation #<id> not found` | new |
| configuration | `config #<id> not found` | new |
| activity type | `activity type #<id> not found` | new |

All errors use the existing Nest shape `{ message, error, statusCode }`, which
`ErrorResponseDto` documents.

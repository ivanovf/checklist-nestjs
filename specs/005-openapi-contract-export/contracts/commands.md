# Contract: Export and Check Commands

**Feature**: `specs/005-openapi-contract-export` | Serves FR-009, FR-010, FR-013

## `pnpm docs:export`

| Aspect | Contract |
|---|---|
| Does | builds the app (`nest build`), then writes `openapi.json` at the repository root |
| Needs | installed dependencies only. No database, no `.env.*`, no secrets, no network listener |
| Output | OpenAPI 3.0 JSON, 2-space indent, trailing `\n`, LF endings |
| Idempotent | a second run with no code change produces a byte-identical file |
| Exit | `0` on success. Non-zero if the build or the document generation fails, with the error on stderr |
| Side effects | writes `openapi.json` and `dist/`. Nothing else |

## `pnpm docs:check`

| Aspect | Contract |
|---|---|
| Does | generates the document from the **existing** `dist/` (does not rebuild) and compares it byte-for-byte with the committed `openapi.json` |
| Precondition | `pnpm build` has just run. CI runs `pnpm build && pnpm docs:check` as the Build gate |
| Exit `0` | identical. Prints nothing, or a one-line confirmation |
| Exit `1` | different, or `openapi.json` missing. Prints the message below and the first differing operation or schema |
| Side effects | none. It never writes `openapi.json` |

Failure message (FR-013: names the file and the fix):

```text
openapi.json is out of date with the code.
Run `pnpm docs:export` and commit the result.
First difference: <path or schema name>
```

## Why two commands

`docs:export` rebuilds so a contributor gets a correct file in one step. `docs:check`
does not rebuild, so CI compiles once, and the check verifies the exact artifact the
Build gate produced. Both share one generator (`src/openapi/`), so they cannot disagree
about how the document is made.

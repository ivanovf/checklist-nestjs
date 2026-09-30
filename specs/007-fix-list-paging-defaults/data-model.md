# Data Model: Optional, Bounded Paging on the Account, Item and Lock Lists

**Feature**: `specs/007-fix-list-paging-defaults` | **Date**: 2026-09-29

No stored data changes, and no index is added (the sort is on `_id`).

## Paging query (`PaginationQueryDto`, `src/filter_dto/pagination-query.dto.ts`)

Used as-is by `GET /api/users/all`, `/api/items/all` and `/api/locks/all`, and extended by
`FilterReservationsDto` for `/api/reservations/all`. `FilterListDto` is removed.

| Field | Type after conversion | Default | Rule | Refused (400) when |
|---|---|---|---|---|
| `limit` | integer | 10 | 1 ≤ limit ≤ `MAX_PAGE_SIZE` (50) | not an integer, < 1, > 50, empty, repeated |
| `offset` | integer | 0 | offset ≥ 0 | not an integer, < 0, repeated |

The refusal messages are class-validator's defaults, the same ones the reservation list
returns, for example `limit must not be greater than 50` and
`offset must not be less than 0`.

## Read order

| List | Order |
|---|---|
| accounts, items, locks | `{ _id: 1 }` (oldest first; unique, so pages never overlap) |
| reservations | unchanged: `{ dateIni, _id }` per `sort` (006) |

## Response

Unchanged: a JSON array of the list's response DTO, at most `limit` long. Accounts are still
projected without their password.

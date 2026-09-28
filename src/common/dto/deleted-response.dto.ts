/**
 * What most delete routes answer: `{ "deleted": true }` (observed 2026-09-28). Also what
 * they answer for an id that matches no record (discrepancy D2).
 *
 * Documentation only: nothing constructs this class.
 */
export class DeletedResponseDto {
  deleted: boolean;
}

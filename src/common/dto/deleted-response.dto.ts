/**
 * What most delete routes answer: `{ "deleted": true }`, only when a record was actually
 * deleted. An unknown id is refused with 404 (D2, fixed by specs/008-fix-unknown-id-404).
 *
 * Documentation only: nothing constructs this class.
 */
export class DeletedResponseDto {
  deleted: boolean;
}

/**
 * Documentation only: describes the stored record exactly as the service returns it
 * (observed 2026-09-28), internal fields included (discrepancy D3). Nothing constructs it.
 */
export class LockResponseDto {
  _id: string;

  lock: string;

  userNumber: string;

  createdAt: Date;

  updatedAt: Date;

  __v: number;
}

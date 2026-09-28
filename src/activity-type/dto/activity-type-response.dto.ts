/**
 * Documentation only: describes the stored record exactly as the service returns it
 * (observed 2026-09-28), internal fields included (discrepancy D3). Nothing constructs it.
 */
export class ActivityTypeResponseDto {
  _id: string;

  name: string;

  budget: number;

  description?: string;

  createdAt: Date;

  updatedAt: Date;

  __v: number;
}

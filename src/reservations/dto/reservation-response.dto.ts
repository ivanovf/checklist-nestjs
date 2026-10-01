/** A checklist item embedded in a reservation. Embedded items carry no `__v`. */
export class ReservationItemResponseDto {
  _id: string;

  label: string;

  status: boolean;

  checked: boolean;

  description?: string;

  comments: string;

  category: string;

  createdAt: Date;

  updatedAt: Date;
}

/**
 * Documentation only: describes the stored record exactly as the service returns it
 * (observed 2026-09-28), internal fields included (discrepancy D3). Nothing constructs it.
 */
export class ReservationResponseDto {
  _id: string;

  dateIni: Date;

  dateEnd: Date;

  type: string;

  validated: boolean;

  contact: string;

  /** The assigned lock: a lock code's user slot (e.g. `03`), or an older reservation's lock id. */
  userLock?: string;

  quantity: number;

  cost?: number;

  items: ReservationItemResponseDto[];

  createdAt: Date;

  updatedAt: Date;

  __v: number;
}
